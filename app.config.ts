import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  return {
    ...config,
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

