import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useLayoutEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

/**
 * Root route: after restore session + prefs, send users to the right place.
 */
export default function Index() {
  const router = useRouter();
  const { bootstrapNavigationReady, firebaseUser, isGuest, isAdmin, isProfileComplete } = useAuth();

  useLayoutEffect(() => {
    if (!bootstrapNavigationReady) return;
    const authedMember = !!(firebaseUser && !isGuest);
    const guestBrowse = !!(isGuest && !firebaseUser);
    if (!authedMember && !guestBrowse) return;
    try {
      router.dismissAll();
    } catch {
      /* ignore */
    }
  }, [bootstrapNavigationReady, firebaseUser, isGuest, isAdmin, router]);

  if (!bootstrapNavigationReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color="#DC143C" />
      </View>
    );
  }

  if (firebaseUser && !isGuest) {
    if (!isAdmin && user && !isProfileComplete) {
      return <Redirect href="/profile-complete" />;
    }
    if (!isAdmin && !user) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
          <ActivityIndicator size="large" color="#DC143C" />
        </View>
      );
    }
    return <Redirect href={(isAdmin ? '/admin-dashboard' : '/(tabs)/home') as never} />;
  }

  if (isGuest && !firebaseUser) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/splash" />;
}
