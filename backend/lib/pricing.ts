// Backend pricing utilities - no React/Expo dependencies
import { SubscriptionTier, SubscriptionDuration } from '@/types';

// Pricing table (TOTAL price for duration)
const TOTAL_PRICES: Record<SubscriptionDuration, Record<SubscriptionTier, number>> = {
  1:    { silver: 65,  gold: 90,  diamond: 140, elite: 225 },
  3:    { silver: 165, gold: 220, diamond: 300, elite: 550 },
  6:    { silver: 290, gold: 360, diamond: 480, elite: 900 },
  9:    { silver: 0,   gold: 0,   diamond: 0,   elite: 0 }, // Not in original, but needed for type
  12:   { silver: 520, gold: 635, diamond: 850, elite: 1600 },
};

export function calculateSubscriptionPrice(
  tier: SubscriptionTier, 
  duration: SubscriptionDuration
): { monthlyPrice: number; totalPrice: number } {
  const durationPrices = TOTAL_PRICES[duration] as Record<SubscriptionTier, number> | undefined;
  const totalPrice = durationPrices ? durationPrices[tier] : 0;
  const months = Number(duration) || 1;
  const monthlyPrice = months > 0 ? Math.round(totalPrice / months) : 0;
  return { monthlyPrice, totalPrice };
}

/**
 * Total passes allocated for a subscription, scaled by purchased duration.
 * 1 pass per day: 1 month = 30, 3 months = 90, and a full year (12 months) = 365.
 * Deduction rules (1 pass/day or per check-in, midnight expiry) are unchanged;
 * this only controls the total allocation pool (the denominator shown as X/total).
 */
export function getTotalPassesForDuration(duration: SubscriptionDuration): number {
  const months = Number(duration) || 1;
  if (months === 12) return 365;
  return months * 30;
}

