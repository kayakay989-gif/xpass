import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions, firestoreCheckIns, firestoreGyms } from '@/backend/lib/firestore-admin';
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
    console.log('[CheckIn] Starting check-in validation:', { userId: input.userId, gymId: input.gymId });
    
    if (ctx.user?.uid !== input.userId) {
      console.error('[CheckIn] Unauthorized: user mismatch');
      throw new Error('Unauthorized');
    }

    // Validate user has active subscription
    const subscription = await firestoreSubscriptions.getByUserId(input.userId);
    if (!subscription) {
      console.error('[CheckIn] No subscription found for user:', input.userId);
      throw new Error('No active subscription found. Please subscribe to check in.');
    }
    
    if (!subscription.isActive) {
      console.error('[CheckIn] Subscription is not active:', subscription.id);
      throw new Error('Your subscription is not active. Please renew your subscription.');
    }

    // Check if subscription has expired
    if (subscription.endDate < new Date()) {
      console.error('[CheckIn] Subscription expired:', subscription.endDate);
      throw new Error('Your subscription has expired. Please renew your subscription.');
    }

    // Check monthly visit limit
    if (subscription.visitsUsed >= subscription.maxVisitsPerMonth) {
      console.error('[CheckIn] Monthly visit limit reached:', { used: subscription.visitsUsed, max: subscription.maxVisitsPerMonth });
      throw new Error('Monthly visit limit reached. Your limit resets next month.');
    }

    // Daily policy: only one gym check-in per calendar day (regardless of gym).
    const todayCheckIn = await firestoreCheckIns.getTodayCheckIn(input.userId);
    if (todayCheckIn) {
      console.error('[CheckIn] Daily check-in limit reached');
      throw new Error('Check In Daily Limit Reached, Limit Resets On the Next Calendar Day');
    }

    // Validate gym exists
    const gym = await firestoreGyms.getById(input.gymId);
    if (!gym) {
      console.error('[CheckIn] Gym not found:', input.gymId);
      throw new Error('Gym not found. Please scan a valid QR code.');
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
      gymTierLevel 
    });

    if (userTierLevel < gymTierLevel) {
      console.error('[CheckIn] Tier mismatch:', { userTier: subscription.tier, gymTier });
      throw new Error(`Your current plan (${subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}) does not include this gym. Please upgrade your subscription to access ${gymTier.charAt(0).toUpperCase() + gymTier.slice(1)} tier gyms.`);
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
      visitsUsed: subscription.visitsUsed + 1,
      // Used by backend credit logic and for auditing daily check-ins.
      lastCheckInDate: new Date(),
    });

    return { success: true, checkIn };
  });
