/**
 * Unified Tier Color System
 * 
 * These colors are used consistently across:
 * - Subscription Package cards
 * - Gym Info Accessibility badges
 * - Gym cards
 * - Tier filters
 * - Any place where tiers are displayed
 */

export const TIER_COLORS = {
  silver: {
    // Main badge/button color (dark navy/black)
    primary: '#111827',
    // Card background (light gray)
    cardBg: '#F5F7FA',
    // Button/chip background
    chipBg: '#E6EEF8',
    // Text colors
    textOnPrimary: '#FFFFFF',
    textOnCard: '#5B667A',
    textOnChip: '#111827',
  },
  gold: {
    // Main badge/button color (gold/yellow - matches package button)
    primary: '#FFE0AE',
    // Card background (light orange/peach)
    cardBg: '#FFF3E8',
    // Button/chip background (same as primary for badges)
    chipBg: '#FFE0AE',
    // Text colors
    textOnPrimary: '#3B2F12',
    textOnCard: '#B58B2E',
    textOnChip: '#3B2F12',
  },
  diamond: {
    // Main badge/button color (purple)
    primary: '#6D5BD0',
    // Card background (light purple)
    cardBg: '#F4F1FF',
    // Button/chip background
    chipBg: '#E1DAFF',
    // Text colors
    textOnPrimary: '#FFFFFF',
    textOnCard: '#6D5BD0',
    textOnChip: '#2D1D76',
  },
  elite: {
    // Main badge/button color (blue)
    primary: '#1D7EF5',
    // Card background (light blue)
    cardBg: '#EEF6FF',
    // Button/chip background
    chipBg: '#BFE4FF',
    // Text colors
    textOnPrimary: '#FFFFFF',
    textOnCard: '#1D7EF5',
    textOnChip: '#0B2A52',
  },
} as const;

/**
 * Get tier badge colors for use in badges/chips
 * Returns the primary color with appropriate text color
 */
export function getTierBadgeColors(tier: 'silver' | 'gold' | 'diamond' | 'elite'): {
  backgroundColor: string;
  textColor: string;
} {
  const colors = TIER_COLORS[tier];
  return {
    backgroundColor: colors.primary,
    textColor: colors.textOnPrimary,
  };
}

/**
 * Get tier package theme colors
 * Used in subscription package cards
 */
export function getTierPackageTheme(tier: 'silver' | 'gold' | 'diamond' | 'elite') {
  return TIER_COLORS[tier];
}
