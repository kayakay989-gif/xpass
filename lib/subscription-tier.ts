import type { SubscriptionTier } from '@/types';

const TIERS: SubscriptionTier[] = ['silver', 'gold', 'diamond', 'elite'];

/**
 * Firestore / backend may store tier with different casing; normalize for UI comparison.
 */
export function normalizeSubscriptionTier(value: unknown): SubscriptionTier | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  // e.g. "Elite Package", "elite_tier", "ELITE"
  const compact = raw.replace(/[^a-z]/g, '');
  for (const t of TIERS) {
    if (raw === t || raw.startsWith(`${t} `) || raw.startsWith(`${t}_`)) {
      return t;
    }
    if (compact === t || compact.startsWith(t)) {
      return t;
    }
  }
  return null;
}
