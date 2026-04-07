import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

/**
 * Stripe PaymentSheet requires a provider on native when using card payments.
 * If no publishable key is set, children render without Stripe (Mastercard flow only).
 */
export function StripeRoot({ children }: { children: React.ReactNode }) {
  if (!publishableKey.trim()) {
    return <>{children}</>;
  }
  return (
    <StripeProvider
      publishableKey={publishableKey.trim()}
      merchantIdentifier="merchant.com.xpass.app"
      urlScheme="xpass"
    >
      {children}
    </StripeProvider>
  );
}
