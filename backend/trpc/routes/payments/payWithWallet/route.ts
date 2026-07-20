import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { computeAmount, payWithDeviceToken, MastercardGatewayError } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import {
  firestorePayments,
  firestoreSubscriptions,
  firestoreUsers,
  firestoreCoupons,
  firestoreWalletTransactions,
} from '@/backend/lib/firestore-admin';
import { runReferralRewardAfterSubscriptionSuccess } from '@/backend/lib/referrals';
import { sendSubscriptionSuccessEmail } from '@/backend/lib/subscription-email';
import { getTotalPassesForDuration } from '@/backend/lib/pricing';
import { isComingSoonTier } from '@/lib/coming-soon-tiers';
import { isMemberProfileComplete } from '@/lib/profile-validation';
import { isSubscriptionActiveForMember } from '@/lib/subscription-active';
import { notifySubscriptionActivated } from '@/backend/lib/push-notifications';

/**
 * Apple Pay / Google Pay checkout.
 *
 * Supports coupons and partial internal-wallet balance (same pricing rules as
 * card checkout). The device wallet is charged only for the remaining amount
 * after coupon discount and optional wallet balance.
 */
export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      paymentMethod: z.enum(['apple_pay', 'google_pay']),
      paymentToken: z.string().min(1),
      useWallet: z.boolean().default(false),
      couponCode: z.string().optional(),
      currency: z.string().optional().default('JOD'),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const currency = input.currency || 'JOD';
    const walletType = input.paymentMethod === 'apple_pay' ? 'APPLE_PAY' : 'GOOGLE_PAY';

    const user = await firestoreUsers.getById(input.userId);
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    if (isComingSoonTier(input.tier)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This package is coming soon' });
    }

    if (!isMemberProfileComplete(user, user.email)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Please complete your profile (name, age, and email) before subscribing',
      });
    }

    const existing = await firestoreSubscriptions.getByUserId(input.userId);
    if (existing && isSubscriptionActiveForMember(existing)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have an active subscription' });
    }

    const { amount: originalAmount, monthlyPrice } = computeAmount({
      tier: input.tier,
      duration: input.duration,
    });

    let finalAmount = originalAmount;
    let couponId: string | null = null;
    let discountAmount = 0;

    if (input.couponCode) {
      const upperCode = input.couponCode.toUpperCase().trim();
      const coupon = await firestoreCoupons.getByCode(upperCode);

      if (!coupon) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid coupon code' });
      }
      if (!coupon.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This coupon is not active' });
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This coupon has expired' });
      }
      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This coupon has reached its usage limit' });
      }

      discountAmount = (originalAmount * coupon.discountPercent) / 100;
      finalAmount = Math.max(0, originalAmount - discountAmount);
      couponId = coupon.id;
    }

    const walletBalance = user.walletBalance || 0;
    const walletUsed = input.useWallet ? Math.min(walletBalance, finalAmount) : 0;
    const remainingAmount = Math.max(0, finalAmount - walletUsed);

    if (input.useWallet && walletUsed > walletBalance) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient wallet balance' });
    }

    const orderId = `wallet-${Date.now()}`;
    const paymentTransactionId = '1';

    let gatewayResponse: any = null;

    if (remainingAmount > 0) {
      if (!input.paymentToken) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Wallet payment token is required' });
      }

      try {
        gatewayResponse = await payWithDeviceToken({
          orderId,
          paymentTransactionId,
          deviceToken: input.paymentToken,
          walletType,
          amount: remainingAmount,
          currency,
          reference: orderId,
        });
      } catch (err) {
        if (err instanceof MastercardGatewayError) {
          console.error('[PayWithWallet] Gateway error', { orderId, status: err.status });
          return {
            success: false,
            error: {
              type: err.isNetworkError ? 'network' : 'payment_declined',
              message: err.isNetworkError
                ? 'Payment service is temporarily unavailable. Please try again.'
                : 'Your bank declined the payment. Try another method or contact your bank.',
            },
          };
        }
        throw err;
      }

      if (gatewayResponse?.result !== 'SUCCESS') {
        return {
          success: false,
          error: {
            type: 'payment_declined',
            message: 'Your bank declined the payment. Try another method or contact your bank.',
          },
        };
      }
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + input.duration);

    const subscription: Subscription = {
      id: `sub-${Date.now()}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      startDate,
      endDate,
      monthlyPrice,
      totalPrice: finalAmount,
      visitsUsed: 0,
      maxVisitsPerMonth: getTotalPassesForDuration(input.duration),
      isActive: true,
    };

    await firestoreSubscriptions.create(subscription);

    if (walletUsed > 0) {
      await firestoreUsers.update(input.userId, {
        walletBalance: walletBalance - walletUsed,
      });
      await firestoreWalletTransactions.create({
        userId: input.userId,
        type: 'subscription_payment',
        amount: -walletUsed,
        description: `Subscription payment for ${input.tier} package (${input.duration} month${input.duration > 1 ? 's' : ''})`,
        subscriptionId: subscription.id,
        createdAt: new Date(),
      });
    }

    await firestorePayments.create({
      id: `${orderId}-${paymentTransactionId}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      amount: remainingAmount,
      originalAmount,
      discountAmount,
      currency,
      orderId,
      transactionId: paymentTransactionId,
      status: 'succeeded',
      paymentMethod: input.paymentMethod,
      couponCode: input.couponCode?.toUpperCase().trim() || null,
      walletUsed,
      externalPaymentAmount: remainingAmount,
      totalAmount: finalAmount,
      completedAt: new Date(),
      gatewayResponse,
      subscriptionId: subscription.id,
    });

    if (couponId) {
      await firestoreCoupons.incrementUsage(couponId);
    }

    await runReferralRewardAfterSubscriptionSuccess({
      payerUserId: input.userId,
      subscriptionId: subscription.id,
      subscriptionIsActive: subscription.isActive === true,
      referredUserName: user.name,
    });

    if (user.email) {
      try {
        await sendSubscriptionSuccessEmail({
          toEmail: user.email,
          userName: user.name,
          subscription,
          orderId,
          paymentId: `${orderId}-${paymentTransactionId}`,
          paidAmount: finalAmount,
          currency,
        });
      } catch (emailError) {
        console.error('[PayWithWallet] Failed to send subscription success email:', emailError);
      }
    }

    await notifySubscriptionActivated(input.userId, subscription);

    return {
      success: true,
      subscription,
      orderId,
      paymentTransactionId,
      walletUsed,
      externalPaymentAmount: remainingAmount,
      totalAmount: finalAmount,
    };
  });
