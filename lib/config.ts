// Production configuration (env-driven; no dev fallbacks)
const env =
  typeof process !== 'undefined' && process.env ? (process.env as any) : ({} as Record<string, any>);

const dev =
  typeof (globalThis as any).__DEV__ !== 'undefined'
    ? (globalThis as any).__DEV__
    : env.NODE_ENV !== 'production';

const resolveApiBaseUrl = (): string => {
  return env.EXPO_PUBLIC_RORK_API_BASE_URL || '';
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
    errors.push('API base URL is missing (set EXPO_PUBLIC_RORK_API_BASE_URL)');
  }

  if (errors.length > 0) {
    console.warn('[Config] Configuration warnings:', errors);
    return false;
  }

  return true;
};

export default config;

