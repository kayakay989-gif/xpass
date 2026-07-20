import type { SubscriptionTier } from '@/types';

/** Tiers that are visible but not yet available for purchase. */
export const COMING_SOON_TIERS: SubscriptionTier[] = ['diamond', 'elite'];

export function isComingSoonTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  return COMING_SOON_TIERS.includes(tier.toLowerCase() as SubscriptionTier);
}
