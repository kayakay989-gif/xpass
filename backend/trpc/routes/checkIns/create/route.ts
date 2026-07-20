import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { firestoreSubscriptions, firestoreCheckIns, firestoreGyms } from '@/backend/lib/firestore-admin';
import { logCheckInSync } from '@/backend/lib/check-in-sync-log';
import { CheckIn, SubscriptionTier } from '@/types';
import { randomUUID } from 'crypto';

// Tier hierarchy: silver=1, gold=2, diamond=3, elite=4
const TIER_LEVELS: Record<SubscriptionTier, number> = {
  silver: 1,
  gold: 2,
  diamond: 3,
  elite: 4,
};

// Get gym tier from category
function getGymTierFromCategory(category: string): SubscriptionTier {
  const c = category?.toLowerCase().trim();
  if (c === 'elite') return 'elite';
  if (c === 'diamond') return 'diamond';
  if (c === 'premium') return 'gold';
  return 'silver'; // default to silver
}

export default protectedProcedure
  .input(z.object({
    userId: z.string(),
    gymId: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    const gymId = input.gymId.trim();
    const userId = input.userId.trim();

    logCheckInSync({
      event: 'check_in_create_start',
      userId,
      gymId,
    });

    console.log('[CheckIn] Starting check-in validation:', { userId, gymId });

    if (ctx.user?.uid !== userId) {
      console.error('[CheckIn] Unauthorized: user mismatch');
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    if (!gymId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Gym not found. Please scan a valid QR code.',
      });
    }

    // Validate user has active subscription
    const subscription = await firestoreSubscriptions.getByUserId(userId);
    if (!subscription) {
      console.error('[CheckIn] No subscription found for user:', userId);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No active subscription found. Please subscribe to check in.',
      });
    }

    if (!subscription.isActive) {
      console.error('[CheckIn] Subscription is not active:', subscription.id);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Your subscription is not active. Please renew your subscription.',
      });
    }

    // Check if subscription has expired
    if (subscription.endDate < new Date()) {
      console.error('[CheckIn] Subscription expired:', subscription.endDate);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Your subscription has expired. Please renew your subscription.',
      });
    }

    // Check monthly visit limit
    if (subscription.visitsUsed >= subscription.maxVisitsPerMonth) {
      console.error('[CheckIn] Pass limit reached:', { used: subscription.visitsUsed, max: subscription.maxVisitsPerMonth });
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Your pass limit has been reached. Please subscribe again to continue checking in.',
      });
    }

    // Daily policy: only one gym check-in per calendar day (regardless of gym).
    const todayCheckIn = await firestoreCheckIns.getTodayCheckIn(userId);
    if (todayCheckIn) {
      console.error('[CheckIn] Daily check-in limit reached');
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You have checked in once today. Check back tomorrow.',
      });
    }

    // Validate gym exists
    const gym = await firestoreGyms.getById(gymId);
    if (!gym) {
      console.error('[CheckIn] Gym not found:', gymId);
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Gym not found. Please scan a valid QR code.',
      });
    }

    console.log('[CheckIn] Gym found:', { gymId: gym.id, gymName: gym.name, category: gym.category });

    // Validate tier hierarchy: user tier must be >= gym tier
    const gymTier = getGymTierFromCategory(gym.category);
    const userTierLevel = TIER_LEVELS[subscription.tier];
    const gymTierLevel = TIER_LEVELS[gymTier];

    console.log('[CheckIn] Tier validation:', {
      userTier: subscription.tier,
      userTierLevel,
      gymTier,
      gymTierLevel,
    });

    if (userTierLevel < gymTierLevel) {
      console.error('[CheckIn] Tier mismatch:', { userTier: subscription.tier, gymTier });
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Your current plan (${subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}) does not include this gym. Please upgrade your subscription to access ${gymTier.charAt(0).toUpperCase() + gymTier.slice(1)} tier gyms.`,
      });
    }

    const pricePerVisit = gym.pricePerVisit || 0;
    const checkInId = randomUUID();
    const checkInTimestamp = new Date();

    const checkIn: CheckIn = {
      id: checkInId,
      userId,
      gymId,
      timestamp: checkInTimestamp,
      subscriptionId: subscription.id,
      payoutAmount: pricePerVisit,
    };

    try {
      await firestoreCheckIns.createWithSubscriptionUpdate(checkIn, {
        subscriptionId: subscription.id,
        visitsUsed: subscription.visitsUsed + 1,
        lastCheckInDate: checkInTimestamp,
        maxVisitsPerMonth: subscription.maxVisitsPerMonth,
      });
    } catch (error: any) {
      logCheckInSync({
        event: 'check_in_create_failed',
        userId,
        gymId,
        checkInId,
        reason: error?.message || 'batch_write_failed',
      });
      console.error('[CheckIn] Persist failed:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Check-in could not be saved. Please try again.',
      });
    }

    const persisted = await firestoreCheckIns.getById(checkInId);
    const persistedForGym = persisted
      ? (await firestoreCheckIns.getByGymId(gymId)).some((ci) => ci.id === checkInId)
      : false;

    if (!persisted || persisted.gymId !== gymId || !persistedForGym) {
      logCheckInSync({
        event: 'check_in_create_failed',
        userId,
        gymId,
        checkInId,
        persisted: false,
        reason: 'post_write_verification_failed',
      });
      console.error('[CheckIn] Post-write verification failed:', {
        checkInId,
        persisted: !!persisted,
        persistedGymId: persisted?.gymId,
        persistedForGym,
      });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Check-in could not be confirmed. Please try again or contact support.',
      });
    }

    logCheckInSync({
      event: 'check_in_persisted',
      userId,
      gymId,
      checkInId,
      persisted: true,
    });

    console.log('[CheckIn] Check-in persisted and verified:', {
      checkInId,
      gymId,
      timestamp: checkInTimestamp.toISOString(),
    });

    return { success: true, checkIn: persisted };
  });
