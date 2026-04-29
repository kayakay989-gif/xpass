import type { ExpoConfig, ConfigContext } from 'expo/config';

const DEFAULT_RORK_API_BASE_URL = 'https://xpass-b66g.onrender.com';

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

  /** Baked into the native manifest; read at runtime via expo-constants (iOS + Android). */
  const rorkApiBaseUrl =
    (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim() ||
    DEFAULT_RORK_API_BASE_URL;

  return {
    ...config,
    name: config.name ?? 'Xpass',
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
    },
  };
};

