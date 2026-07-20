// Production configuration (env-driven; no dev fallbacks)
const env =
  typeof process !== 'undefined' && process.env ? (process.env as any) : ({} as Record<string, any>);

const dev =
  typeof (globalThis as any).__DEV__ !== 'undefined'
    ? (globalThis as any).__DEV__
    : env.NODE_ENV !== 'production';

const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const getApiBaseUrlFromExpoExtra = (): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const extra =
      Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? Constants?.manifest2?.extra;
    const raw = extra?.rorkApiBaseUrl ?? extra?.EXPO_PUBLIC_RORK_API_BASE_URL;
    if (typeof raw === 'string' && raw.trim()) {
      return trimTrailingSlashes(raw.trim());
    }
  } catch {
    // non-Expo or early init
  }
  return '';
};

const resolveApiBaseUrl = (): string => {
  const fromEnv = env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return trimTrailingSlashes(fromEnv.trim());
  }
  const fromExtra = getApiBaseUrlFromExpoExtra();
  if (fromExtra) {
    return fromExtra;
  }
  return '';
};

export const config = {
  // Firebase Configuration
  firebase: {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  },

  // Google Maps Configuration
  googleMaps: {
    apiKey: env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  },

  // Digital Wallet (Apple Pay / Google Pay) Configuration.
  // All values are env-driven; wallet buttons stay hidden until the native
  // modules report availability, so the stable card flow is never affected.
  wallet: {
    merchantName: env.EXPO_PUBLIC_WALLET_MERCHANT_NAME || 'Xpass',
    // Apple Pay merchant identifier, e.g. "merchant.com.xpass.app".
    // NOTE: this is NOT the App ID (com.xpass.app). It must be a Merchant ID
    // created under Apple Developer > Identifiers > Merchant IDs, with an
    // Apple Pay Payment Processing Certificate registered in the MPGS gateway.
    appleMerchantId: env.EXPO_PUBLIC_APPLE_MERCHANT_ID || '',
    // Google Pay production merchant id (Google Pay Business Console)
    googleMerchantId: env.EXPO_PUBLIC_GOOGLE_PAY_MERCHANT_ID || 'BCR2DN5T22RLHU35',
    // MPGS Google Pay tokenization gateway name is "mpgs" (NOT "mastercard").
    gateway: env.EXPO_PUBLIC_WALLET_GATEWAY || 'mpgs',
    gatewayMerchantId: env.EXPO_PUBLIC_WALLET_GATEWAY_MERCHANT_ID || '9589667361EP',
    allowedNetworks: ['VISA', 'MASTERCARD'] as string[],
    country: env.EXPO_PUBLIC_WALLET_COUNTRY || 'JO',
  },

  // App Configuration
  app: {
    name: "Xpass Subscription App",
    version: "1.0.0",
    environment: dev ? "development" : "production",
    // Set a remote URL for the splash background image to enable the new design.
    // Leave empty to fall back to the gradient background.
    splashBackgroundUrl: "",
  },

  // API Configuration
  api: {
    baseUrl: resolveApiBaseUrl(),
  },
};

// Validate configuration
export const validateConfig = () => {
  const errors: string[] = [];

  if (!config.firebase.apiKey || config.firebase.apiKey.includes('your-')) {
    errors.push('Firebase API key is missing or invalid');
  }

  if (!config.firebase.projectId || config.firebase.projectId.includes('your-')) {
    errors.push('Firebase project ID is missing or invalid');
  }

  if (!config.googleMaps.apiKey || config.googleMaps.apiKey.includes('your-')) {
    errors.push('Google Maps API key is missing or invalid');
  }

  if (!config.api.baseUrl && !dev) {
    errors.push(
      'API base URL is missing (set EXPO_PUBLIC_RORK_API_BASE_URL or app extra rorkApiBaseUrl via app.config)'
    );
  }

  if (errors.length > 0) {
    console.warn('[Config] Configuration warnings:', errors);
    return false;
  }

  return true;
};

export default config;

