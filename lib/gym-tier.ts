import Colors from '@/constants/colors';
import type { Gym, GymCategory, SubscriptionTier } from '@/types';

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
  const allowed = Array.isArray(gym.allowedTiers) ? gym.allowedTiers.map(normalizeTier).filter(Boolean) as SubscriptionTier[] : [];
  for (const t of TIER_ORDER) {
    if (allowed.includes(t)) return t;
  }
  return categoryToTier(gym.category);
}

export function getTierLabel(tier: SubscriptionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function getTierBadgeColors(tier: SubscriptionTier): { backgroundColor: string; textColor: string } {
  switch (tier) {
    case 'silver':
      return { backgroundColor: '#111827', textColor: Colors.white };
    case 'gold':
      return { backgroundColor: '#F6C343', textColor: Colors.black };
    case 'diamond':
      return { backgroundColor: '#6D5BD0', textColor: Colors.white };
    case 'elite':
      return { backgroundColor: '#1D7EF5', textColor: Colors.white };
    default:
      return { backgroundColor: Colors.textSecondary, textColor: Colors.white };
  }
}

