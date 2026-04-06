import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  const appVersion = config.version ?? '1.0.15';

  return {
    ...config,
    // Bare workflow: EAS rejects runtimeVersion.policy; keep in sync with expo.version (appVersion policy equivalent).
    runtimeVersion: appVersion,
    name: config.name ?? 'Xpass',
    ios: {
      ...config.ios,
      config: {
        ...(config.ios as any)?.config,
        googleMapsApiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android as any)?.config,
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};

