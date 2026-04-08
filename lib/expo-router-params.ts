/** Expo Router can pass duplicate keys as `string[]`; normalize to a single string. */
export function paramFirst(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}
