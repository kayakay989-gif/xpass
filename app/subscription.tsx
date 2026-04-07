import { Redirect } from 'expo-router';

/**
 * Compatibility route for links to `/subscription`.
 * Packages UI lives in `app/(tabs)/subscription.tsx` — avoid stacking a modal + replace (Android native crashes).
 */
export default function SubscriptionRedirect() {
  return <Redirect href="/(tabs)/subscription" />;
}
