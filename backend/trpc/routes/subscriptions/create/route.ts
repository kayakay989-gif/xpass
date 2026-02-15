import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions } from '@/backend/lib/firestore-admin';
import { Subscription, SubscriptionTier, SubscriptionDuration } from '@/types';
import { calculateSubscriptionPrice } from '@/backend/lib/pricing';
import { randomUUID } from 'crypto';

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
      maxVisitsPerMonth: 30,
      isActive: true,
    };

    await firestoreSubscriptions.create(subscription);
    
    return subscription;
  });
