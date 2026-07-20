import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions } from '@/backend/lib/firestore-admin';
import { Subscription, SubscriptionTier, SubscriptionDuration } from '@/types';
import { calculateSubscriptionPrice, getTotalPassesForDuration } from '@/backend/lib/pricing';
import { notifySubscriptionActivated } from '@/backend/lib/push-notifications';
import { randomUUID } from 'crypto';
import { firestoreUsers } from '@/backend/lib/firestore-admin';
import { sendSubscriptionSuccessEmail } from '@/backend/lib/subscription-email';
import { isSubscriptionActiveForMember } from '@/lib/subscription-active';

export default protectedProcedure
  .input(z.object({
    userId: z.string(),
    tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
    duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
  }))
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }

    // Check if user already has an active subscription
    const existingSubscription = await firestoreSubscriptions.getByUserId(input.userId);
    if (existingSubscription && isSubscriptionActiveForMember(existingSubscription)) {
      throw new Error('You already have an active subscription');
    }

    const { monthlyPrice, totalPrice } = calculateSubscriptionPrice(input.tier, input.duration);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + input.duration);

    const subscription: Subscription = {
      id: randomUUID(),
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

    const user = await firestoreUsers.getById(input.userId);
    if (user?.email) {
      try {
        await sendSubscriptionSuccessEmail({
          toEmail: user.email,
          userName: user.name,
          subscription,
          paymentId: subscription.id,
          paidAmount: subscription.totalPrice,
          currency: 'JOD',
        });
      } catch (emailError) {
        console.error('[SubscriptionsCreate] Failed to send subscription success email:', emailError);
      }
    }

    await notifySubscriptionActivated(input.userId, subscription);

    return subscription;
  });
