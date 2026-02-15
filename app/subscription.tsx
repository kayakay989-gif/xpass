import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Canonical purchase flow lives in `app/(tabs)/subscription.tsx` (packages -> /payment).
 * Keep `/subscription` as a compatibility route, but redirect so the flow/UI stay consistent.
 */
export default function SubscriptionRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(tabs)/subscription' as any);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
      <ActivityIndicator />
    </View>
  );
}

