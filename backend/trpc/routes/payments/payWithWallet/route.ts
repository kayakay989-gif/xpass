import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { computeAmount, payWithDeviceToken, MastercardGatewayError } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import { firestorePayments, firestoreSubscriptions, firestoreUsers } from '@/backend/lib/firestore-admin';
import { runReferralRewardAfterSubscriptionSuccess } from '@/backend/lib/referrals';
import { sendSubscriptionSuccessEmail } from '@/backend/lib/subscription-email';
import { getTotalPassesForDuration } from '@/backend/lib/pricing';
import { notifySubscriptionActivated } from '@/backend/lib/push-notifications';

/**
 * Apple Pay / Google Pay checkout.
 *
 * The wallet sheet is presented natively on-device; the resulting tokenized
 * payment token is passed here and charged through the existing MPGS gateway via
 * payWithDeviceToken(). After a successful charge this follows the SAME
 * post-payment subscription logic as the card flow (scaled passes, referral
 * reward, confirmation email, push). The card flow is untouched.
 */
export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      paymentMethod: z.enum(['apple_pay', 'google_pay']),
      paymentToken: z.string().min(1), // Tokenized wallet payment data from the device
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

    // Block duplicate active subscriptions (parity with card checkout).
    const existing = await firestoreSubscriptions.getByUserId(input.userId);
    if (existing) {
      const endDate = existing.endDate ? new Date(existing.endDate) : null;
      const now = new Date();
      if (existing.isActive && endDate && endDate.getTime() > now.getTime()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have an active subscription' });
      }
    }

    const { amount: totalPrice, monthlyPrice } = computeAmount({
      tier: input.tier,
      duration: input.duration,
    });

    const orderId = `wallet-${Date.now()}`;
    const paymentTransactionId = '1';

    let gatewayResponse: any = null;
    try {
      // Gateway-managed decryption: pass the device wallet token straight through.
      // Apple Pay requires the gateway to hold the Payment Processing Certificate
      // (CSR generated in Merchant Administration, not on a Mac).
      gatewayResponse = await payWithDeviceToken({
        orderId,
        paymentTransactionId,
        deviceToken: input.paymentToken,
        walletType,
        amount: totalPrice,
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
      totalPrice,
      visitsUsed: 0,
      maxVisitsPerMonth: getTotalPassesForDuration(input.duration),
      isActive: true,
    };

    await firestoreSubscriptions.create(subscription);

    await firestorePayments.create({
      id: `${orderId}-${paymentTransactionId}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      amount: totalPrice,
      currency,
      orderId,
      transactionId: paymentTransactionId,
      status: 'succeeded',
      paymentMethod: input.paymentMethod,
      externalPaymentAmount: totalPrice,
      totalAmount: totalPrice,
      completedAt: new Date(),
      gatewayResponse,
    });

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
          paidAmount: totalPrice,
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
      totalAmount: totalPrice,
    };
  });
