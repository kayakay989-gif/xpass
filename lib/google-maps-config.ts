// Google Maps API Configuration
const getGoogleMapsApiKeyFromExpoExtra = (): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const extra =
      Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? Constants?.manifest2?.extra;
    const raw = extra?.googleMapsApiKey;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  } catch {
    // non-Expo or early init
  }
  return '';
};

// Must reference process.env.EXPO_PUBLIC_* directly so Expo inlines it in production web builds.
const fromEnv =
  typeof process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY === 'string'
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.trim()
    : '';

/** Env at build time (dev) or expo.extra.googleMapsApiKey (production web export). */
export const GOOGLE_MAPS_API_KEY =
  fromEnv || getGoogleMapsApiKeyFromExpoExtra() || 'REPLACE_ME';

// Google Maps configuration for web
export const GOOGLE_MAPS_WEB_CONFIG = {
  apiKey: GOOGLE_MAPS_API_KEY,
  version: 'weekly',
  libraries: ['places', 'geometry'] as const,
};

export default {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_WEB_CONFIG,
};
