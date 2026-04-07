import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { Subscription } from '@/types';
import {
  firestoreCoupons,
  firestorePayments,
  firestoreSubscriptions,
  firestoreUsers,
  firestoreWalletTransactions,
} from '@/backend/lib/firestore-admin';
import { getStripe } from '@/backend/lib/stripe-client';

/**
 * After PaymentSheet succeeds on the client, verify the PaymentIntent and create the subscription.
 */
export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      paymentIntentId: z.string().min(3),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const paymentDocId = `stripe-${input.paymentIntentId}`;
    const existingPayment = await firestorePayments.getById(paymentDocId);
    if (existingPayment && String(existingPayment.status).toLowerCase() === 'succeeded') {
      const subId = existingPayment.subscriptionId;
      return { ok: true as const, alreadyFinalized: true as const, subscriptionId: subId || null };
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

    const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    if (pi.metadata?.userId !== input.userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Payment does not belong to this user.' });
    }

    if (pi.status !== 'succeeded') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Payment is not complete (status: ${pi.status}).`,
      });
    }

    const tier = pi.metadata.tier as Subscription['tier'];
    const duration = Number(pi.metadata.duration) as Subscription['duration'];
    const finalAmount = Number(pi.metadata.finalAmount);
    const monthlyPrice = Number(pi.metadata.monthlyPrice);
    const walletUsed = Number(pi.metadata.walletUsed || '0');
    const couponId = pi.metadata.couponId?.trim() || null;
    const orderId = pi.metadata.orderId || '';

    if (!tier || !['silver', 'gold', 'diamond', 'elite'].includes(tier)) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Invalid subscription tier in payment metadata.' });
    }
    if (![1, 3, 6, 9, 12].includes(duration)) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Invalid duration in payment metadata.' });
    }

    const active = await firestoreSubscriptions.getByUserId(input.userId);
    if (active) {
      const endDate = active.endDate ? new Date(active.endDate) : null;
      const now = new Date();
      if (active.isActive && endDate && endDate.getTime() > now.getTime()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have an active subscription' });
      }
    }

    const user = await firestoreUsers.getById(input.userId);
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const walletBalance = user.walletBalance || 0;
    if (walletUsed > walletBalance) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Wallet balance changed; cannot finalize.' });
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + duration);

    const subscription: Subscription = {
      id: `sub-${Date.now()}`,
      userId: input.userId,
      tier,
      duration,
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
        description: `Subscription payment for ${tier} package (${duration} month${duration > 1 ? 's' : ''})`,
        subscriptionId: subscription.id,
        createdAt: new Date(),
      });
    }

    await firestorePayments.update(paymentDocId, {
      status: 'succeeded',
      subscriptionId: subscription.id,
      completedAt: new Date(),
    });

    if (couponId) {
      await firestoreCoupons.incrementUsage(couponId);
    }

    return {
      ok: true as const,
      alreadyFinalized: false as const,
      subscriptionId: subscription.id,
      orderId,
    };
  });
