import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { computeAmount } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import {
  firestoreCoupons,
  firestorePayments,
  firestoreSubscriptions,
  firestoreUsers,
  firestoreWalletTransactions,
} from '@/backend/lib/firestore-admin';
import { adminDb } from '@/backend/lib/firebase-admin';
import { getStripe, jodToStripeAmount, STRIPE_API_VERSION } from '@/backend/lib/stripe-client';

async function readStripeCustomerId(userId: string): Promise<string | undefined> {
  const d = await adminDb.collection('users').doc(userId).get();
  const v = d.data()?.stripeCustomerId;
  return typeof v === 'string' && v.startsWith('cus_') ? v : undefined;
}

async function writeStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await adminDb.collection('users').doc(userId).set({ stripeCustomerId: customerId }, { merge: true });
}

/**
 * Native Stripe PaymentSheet: creates (or reuses) a Customer, PaymentIntent, and ephemeral key.
 * Wallet-only checkout (remaining amount 0) completes here without Stripe.
 */
export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      useWallet: z.boolean().default(false),
      couponCode: z.string().optional(),
      currency: z.string().optional().default('JOD'),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const currency = (input.currency || 'JOD').toLowerCase();
    if (currency !== 'jod') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only JOD is supported for native checkout.' });
    }

    const { amount: originalAmount, monthlyPrice } = computeAmount({
      tier: input.tier,
      duration: input.duration,
      currency: input.currency,
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

    const existingSubscription = await firestoreSubscriptions.getByUserId(input.userId);
    if (existingSubscription) {
      const endDate = existingSubscription.endDate ? new Date(existingSubscription.endDate) : null;
      const now = new Date();
      if (existingSubscription.isActive && endDate && endDate.getTime() > now.getTime()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already have an active subscription',
        });
      }
    }

    const user = await firestoreUsers.getById(input.userId);
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const walletBalance = user.walletBalance || 0;
    const walletUsed = input.useWallet ? Math.min(walletBalance, finalAmount) : 0;
    const remainingAmount = Math.max(0, finalAmount - walletUsed);

    if (input.useWallet && walletUsed > walletBalance) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient wallet balance' });
    }

    const orderId = `stripe-ord-${Date.now()}-${input.userId.substring(0, 8)}`;

    const completeWalletOnly = async () => {
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
        maxVisitsPerMonth: 30,
        isActive: true,
      };

      await firestoreSubscriptions.create(subscription);

      if (walletUsed > 0) {
        const newWalletBalance = walletBalance - walletUsed;
        await firestoreUsers.update(input.userId, {
          walletBalance: newWalletBalance,
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
        id: `${orderId}-wallet`,
        userId: input.userId,
        tier: input.tier,
        duration: input.duration,
        amount: 0,
        originalAmount,
        discountAmount,
        currency: 'JOD',
        orderId,
        status: 'succeeded',
        subscriptionId: subscription.id,
        paymentMethod: 'wallet',
        walletUsed,
        totalAmount: finalAmount,
        completedAt: new Date(),
      });

      if (couponId) {
        await firestoreCoupons.incrementUsage(couponId);
      }

      return { completedWithoutSheet: true as const, subscriptionId: subscription.id };
    };

    if (remainingAmount <= 0) {
      return await completeWalletOnly();
    }

    let stripe: ReturnType<typeof getStripe>;
    try {
      stripe = getStripe();
    } catch (e: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: e?.message || 'Stripe is not configured.',
      });
    }

    let customerId = await readStripeCustomerId(input.userId);
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: input.userId },
      });
      customerId = customer.id;
      await writeStripeCustomerId(input.userId, customerId);
    }

    const amountMinor = jodToStripeAmount(remainingAmount);
    if (amountMinor < 1) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Amount too small for card payment.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: 'jod',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: input.userId,
        tier: input.tier,
        duration: String(input.duration),
        finalAmount: String(finalAmount),
        monthlyPrice: String(monthlyPrice),
        walletUsed: String(walletUsed),
        couponId: couponId || '',
        orderId,
        originalAmount: String(originalAmount),
        discountAmount: String(discountAmount),
      },
    });

    if (!paymentIntent.client_secret) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Stripe did not return a client secret.' });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION }
    );

    if (!ephemeralKey.secret) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Stripe did not return an ephemeral key.' });
    }

    await firestorePayments.create({
      id: `stripe-${paymentIntent.id}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      amount: remainingAmount,
      originalAmount,
      discountAmount,
      currency: 'JOD',
      orderId,
      status: 'PENDING_STRIPE',
      couponCode: input.couponCode?.toUpperCase().trim() || null,
      walletUsed,
      externalPaymentAmount: remainingAmount,
      totalAmount: finalAmount,
      paymentMethod: 'stripe',
      stripePaymentIntentId: paymentIntent.id,
    });

    return {
      completedWithoutSheet: false as const,
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
      paymentIntentId: paymentIntent.id,
      orderId,
    };
  });
