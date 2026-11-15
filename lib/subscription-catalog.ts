import type { SubscriptionDuration, SubscriptionTier } from '@/types';

/** Readable labels for the subscription identifiers already used by XPass. */
export const SUBSCRIPTION_TIER_OPTIONS: { id: SubscriptionTier; label: string }[] = [
  { id: 'silver', label: 'Silver' },
  { id: 'gold', label: 'Gold' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'elite', label: 'Elite' },
];

export const SUBSCRIPTION_DURATION_OPTIONS: { id: SubscriptionDuration; label: string }[] = [
  { id: 1, label: '1 month' },
  { id: 3, label: '3 months' },
  { id: 6, label: '6 months' },
  { id: 12, label: '12 months' },
];

export function subscriptionTierLabel(tier: string): string {
  return SUBSCRIPTION_TIER_OPTIONS.find((option) => option.id === tier)?.label || tier;
}

export function subscriptionDurationLabel(duration: number): string {
  return (
    SUBSCRIPTION_DURATION_OPTIONS.find((option) => option.id === duration)?.label ||
    `${duration} month${duration === 1 ? '' : 's'}`
  );
}
