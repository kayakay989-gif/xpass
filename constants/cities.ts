export const FIXED_CITIES = ['Amman', 'Irbid', 'Aqaba', 'Madaba'] as const;

export type FixedCity = (typeof FIXED_CITIES)[number];

// Options for filters where "all" is allowed (e.g., user discovery filters)
export const CITY_FILTER_OPTIONS: ReadonlyArray<string> = ['all', ...FIXED_CITIES];

