import { Redirect, Stack } from 'expo-router';

/**
 * Compatibility route for links to `/subscription`.
 * Packages UI lives in `app/(tabs)/subscription.tsx`.
 * Screen options live here so root `_layout` does not register a second `subscription` entry.
 */
export default function SubscriptionRedirect() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Redirect href="/(tabs)/subscription" />
    </>
  );
}
