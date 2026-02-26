import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions, firestoreCheckIns, firestoreGyms } from '@/backend/lib/firestore-admin';
import { CheckIn } from '@/types';
import { randomUUID } from 'crypto';

export default protectedProcedure
  .input(z.object({ 
    userId: z.string(),
    gymId: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }

    const subscription = await firestoreSubscriptions.getByUserId(input.userId);
    if (!subscription || !subscription.isActive) {
      throw new Error('No active subscription');
    }

    if (subscription.visitsUsed >= subscription.maxVisitsPerMonth) {
      throw new Error('Monthly visit limit reached');
    }

    const todayCheckIn = await firestoreCheckIns.getTodayCheckIn(input.userId);
    if (todayCheckIn) {
      throw new Error('Already checked in today');
    }

    const gym = await firestoreGyms.getById(input.gymId);
    if (!gym) {
      throw new Error('Gym not found');
    }

    if (!gym.allowedTiers.includes(subscription.tier)) {
      throw new Error('This gym is not available for your tier');
    }

    // Get gym's pricePerVisit for payout calculation
    const pricePerVisit = gym.pricePerVisit || 0;

    const checkIn: CheckIn = {
      id: randomUUID(),
      userId: input.userId,
      gymId: input.gymId,
      timestamp: new Date(),
      subscriptionId: subscription.id,
      payoutAmount: pricePerVisit, // Store the payout amount at check-in time
    };

    await firestoreCheckIns.create(checkIn);
    await firestoreSubscriptions.update(subscription.id, { 
      visitsUsed: subscription.visitsUsed + 1 
    });

    return { success: true, checkIn };
  });
