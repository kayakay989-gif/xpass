import Stripe from 'stripe';

/** Match the API version used when creating ephemeral keys for the mobile SDK. */
export const STRIPE_API_VERSION = '2024-11-20.acacia';

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY is not configured on the server.');
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secret, {
      apiVersion: STRIPE_API_VERSION as unknown as Stripe.LatestApiVersion,
    });
  }
  return stripeSingleton;
}

/** JOD is a three-decimal currency in Stripe — amount in smallest units (1.000 JOD = 1000). */
export function jodToStripeAmount(jod: number): number {
  return Math.round(jod * 1000);
}
