// Google Maps API Configuration
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "REPLACE_ME";

// Google Maps configuration for web
export const GOOGLE_MAPS_WEB_CONFIG = {
  apiKey: GOOGLE_MAPS_API_KEY,
  version: "weekly",
  libraries: ["places", "geometry"] as const,
};

export default {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_WEB_CONFIG,
};

