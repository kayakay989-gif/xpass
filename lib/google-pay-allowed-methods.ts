import config from '@/lib/config';

/** CARD methods JSON for Google PayButton.initialize (no tokenization spec). */
export function getGooglePayAllowedPaymentMethodsJson(): string {
  return JSON.stringify([
    {
      type: 'CARD',
      parameters: {
        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
        allowedCardNetworks: config.wallet.allowedNetworks.map((n) => n.toUpperCase()),
      },
    },
  ]);
}
