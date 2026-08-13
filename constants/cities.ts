export const FIXED_CITIES = [
  'Amman',
  'Irbid',
  'Aqaba',
  'Madaba',
  'Salt',
  'Zarqa',
] as const;

export type FixedCity = (typeof FIXED_CITIES)[number];

// Options for filters where "all" is allowed (e.g., user discovery filters)
export const CITY_FILTER_OPTIONS: ReadonlyArray<string> = ['all', ...FIXED_CITIES];

/** Default map center when adding a gym in a given city (admin panel). */
export const CITY_DEFAULT_COORDINATES: Record<
  FixedCity,
  { latitude: number; longitude: number }
> = {
  Amman: { latitude: 31.9539, longitude: 35.9106 },
  Irbid: { latitude: 32.5556, longitude: 35.85 },
  Aqaba: { latitude: 29.532, longitude: 35.0063 },
  Madaba: { latitude: 31.716, longitude: 35.7939 },
  Salt: { latitude: 32.0345794, longitude: 35.7269079 },
  Zarqa: { latitude: 32.0608187, longitude: 36.0941795 },
};

export function getCityDefaultCoordinates(city: string): {
  latitude: number;
  longitude: number;
} {
  const match = FIXED_CITIES.find(
    (name) => name.toLowerCase() === city.trim().toLowerCase()
  );
  if (match) return CITY_DEFAULT_COORDINATES[match];
  return CITY_DEFAULT_COORDINATES.Amman;
}

export function isFixedCity(city: string): city is FixedCity {
  return FIXED_CITIES.some(
    (name) => name.toLowerCase() === city.trim().toLowerCase()
  );
}
