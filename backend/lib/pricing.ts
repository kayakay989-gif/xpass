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

