/** ISO 4217 fraction digits for currencies this app charges. JOD is 3 (fils). */
const CURRENCY_DIGITS: Record<string, number> = {
  JOD: 3,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

export function currencyDecimalPlaces(currency: string): number {
  return CURRENCY_DIGITS[String(currency || '').toUpperCase()] || 2;
}

/** Round a money amount to the currency's legal fraction digits. */
export function roundGatewayAmount(amount: number, currency = 'JOD'): number {
  const digits = currencyDecimalPlaces(currency);
  const factor = 10 ** digits;
  const n = Number.isFinite(amount) ? amount : 0;
  return Math.round(n * factor) / factor;
}

/**
 * Format an amount for MPGS / wallet APIs.
 * JOD must be 3 decimal places (e.g. "220.000") or the gateway can scale it 10x wrong.
 */
export function formatGatewayAmount(amount: number, currency = 'JOD'): string {
  return roundGatewayAmount(amount, currency).toFixed(currencyDecimalPlaces(currency));
}
