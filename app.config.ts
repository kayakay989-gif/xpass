import type { ExpoConfig, ConfigContext } from 'expo/config';
import fs from 'fs';
import path from 'path';

const DEFAULT_RORK_API_BASE_URL = 'https://xpass-b66g.onrender.com';

/** Keep iOS Google OAuth client id aligned with `GoogleService-Info.plist` at build time. */
function readGoogleServicePlistClientId(): string {
  try {
    const plistPath = path.join(__dirname, 'GoogleService-Info.plist');
    if (!fs.existsSync(plistPath)) return '';
    const xml = fs.readFileSync(plistPath, 'utf8');
    const m = xml.match(/<key>CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/);
    return (m?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

function uniqueArray<T>(value: T[] | undefined): T[] | undefined {
  if (!Array.isArray(value)) return value;
  return Array.from(new Set(value));
}

function uniqueByJson<T>(value: T[] | undefined): T[] | undefined {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  return value.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  const googleIosClientIdFromPlist = readGoogleServicePlistClientId();
  const googleIosScheme = googleIosClientIdFromPlist
    ? `com.googleusercontent.apps.${googleIosClientIdFromPlist.replace(/\.apps\.googleusercontent\.com$/i, '').trim()}`
    : '';

  /** Baked into the native manifest; read at runtime via expo-constants (iOS + Android). */
  const rorkApiBaseUrl =
    (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim() ||
    DEFAULT_RORK_API_BASE_URL;

  return {
    ...config,
    name: config.name ?? 'Xpass',
    plugins: [
      ...(Array.isArray(config.plugins) ? config.plugins : []).filter((entry) => {
        const name = Array.isArray(entry) ? entry[0] : entry;
        return name !== 'expo-notifications';
      }),
      './plugins/withStripApsEntitlement.js',
    ],
    scheme: uniqueArray(
      [
        ...(Array.isArray(config.scheme) ? config.scheme : []),
        'xpass',
        googleIosScheme || undefined,
      ].filter(Boolean) as string[]
    ),
    ios: {
      ...config.ios,
      associatedDomains: uniqueArray(config.ios?.associatedDomains),
      config: {
        ...(config.ios as any)?.config,
        googleMapsApiKey,
      },
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleLocalizations: uniqueArray(
          (config.ios?.infoPlist as Record<string, any> | undefined)
            ?.CFBundleLocalizations as string[] | undefined
        ),
      },
    },
    android: {
      ...config.android,
      intentFilters: uniqueByJson(config.android?.intentFilters),
      permissions: uniqueArray(config.android?.permissions),
      config: {
        ...(config.android as any)?.config,
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    extra: {
      ...(typeof config.extra === 'object' && config.extra !== null ? config.extra : {}),
      rorkApiBaseUrl,
      googleIosClientId:
        // Prefer plist value so runtime always matches iOS app registration in Firebase/Google.
        googleIosClientIdFromPlist || (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim(),
      googleMapsApiKey,
    },
  };
};

