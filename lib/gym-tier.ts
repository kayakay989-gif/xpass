import Colors from '@/constants/colors';
import type { Gym, GymCategory, SubscriptionTier } from '@/types';
import { getTierBadgeColors as getSharedTierBadgeColors } from '@/constants/tier-colors';

const TIER_ORDER: SubscriptionTier[] = ['silver', 'gold', 'diamond', 'elite'];

function normalizeTier(v: any): SubscriptionTier | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (t === 'silver' || t === 'gold' || t === 'diamond' || t === 'elite') return t;
  return null;
}

function categoryToTier(category: any): SubscriptionTier {
  const c = (typeof category === 'string' ? category.trim().toLowerCase() : '') as GymCategory;
  if (c === 'elite') return 'elite';
  if (c === 'diamond') return 'diamond';
  if (c === 'premium') return 'gold';
  // 'standard' (and any unknown) => Silver
  return 'silver';
}

export function getGymTier(gym: Partial<Gym>): SubscriptionTier {
  // IMPORTANT:
  // The visible “Silver / Gold / Diamond / Elite” plan of a gym should
  // come from the gym’s category (the plan selected in the admin panel),
  // not from `allowedTiers` (which describes which subscription tiers can access it).
  //
  // This ensures:
  // - The badge on the gym card always shows the plan chosen when the gym was created.
  // - The tier filters (Silver / Gold / Diamond / Elite) match exactly what is shown
  //   on the badge, because they also call `getGymTier`.
  //
  // If for any reason category is missing, fall back to allowedTiers.
  if (gym.category) {
    return categoryToTier(gym.category);
  }

  const allowed = Array.isArray((gym as any).allowedTiers)
    ? (gym as any).allowedTiers.map(normalizeTier).filter(Boolean) as SubscriptionTier[]
    : [];

  for (const t of TIER_ORDER) {
    if (allowed.includes(t)) return t;
  }

  // Last resort: default to Silver
  return 'silver';
}

export function getTierLabel(tier: SubscriptionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function getTierBadgeColors(tier: SubscriptionTier): { backgroundColor: string; textColor: string } {
  // Use shared tier colors for consistency across the app
  return getSharedTierBadgeColors(tier);
}

