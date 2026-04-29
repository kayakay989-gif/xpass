import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { agentLog } from '@/lib/agent-debug-log';

export default function MySubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { subscription, subscriptionQuery } = useApp();

  const goBackOrHome = () => {
    const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
    if (canGoBack) return router.back();
    return router.replace('/(tabs)/home');
  };

  if (subscriptionQuery.isPending && subscription == null) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 14, fontSize: 15, color: Colors.textSecondary }}>Loading membership…</Text>
        </View>
      </>
    );
  }

  if (!subscription) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={goBackOrHome} style={styles.headerBackButton}>
                <ChevronLeft size={22} color={Colors.text} />
              </TouchableOpacity>
              <Image 
                source={require('../assets/images/main logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.greeting}>Hello {user?.name?.split(' ')[0] || 'Hamza'}</Text>
              <View style={styles.iconsContainer}>
                <View style={styles.profileButton}>
                  <UserIcon size={16} color={Colors.white} />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.emptyText}>No active subscription</Text>
            <TouchableOpacity 
              style={styles.subscribeButton}
              onPress={() => {
                // #region agent log
                agentLog('H5', 'my-subscription.tsx:subscribeNow', 'replace_subscription_tab', {});
                // #endregion
                try {
                  router.replace('/(tabs)/subscription');
                } catch (e) {
                  console.error('[MySubscription] Navigate to subscription failed:', e);
                  router.push('/(tabs)/subscription' as any);
                }
              }}
            >
              <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  const getTierName = (tier: string): string => {
    return tier.charAt(0).toUpperCase() + tier.slice(1) + ' Package';
  };

  const getExpiryDate = () => {
    return new Date(subscription.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getRemainingPasses = () => {
    const max = subscription.maxVisitsPerMonth ?? 0;
    const used = subscription.visitsUsed ?? 0;
    return Math.max(0, max - used);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={goBackOrHome} style={styles.headerBackButton}>
              <ChevronLeft size={22} color={Colors.text} />
            </TouchableOpacity>
            <Image 
              source={require('../assets/images/main logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.greeting}>Hello {user?.name?.split(' ')[0] || 'Hamza'}</Text>
            <View style={styles.iconsContainer}>
              <View style={styles.profileButton}>
                <UserIcon size={16} color={Colors.white} />
              </View>
            </View>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>My Subscription</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current Plan</Text>
            <Text style={styles.detailValue}>{getTierName(subscription.tier)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>{getExpiryDate()}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Remaining Passes this month</Text>
            <Text style={styles.detailValue}>{getRemainingPasses()}</Text>
          </View>

          <Text style={styles.expiryText}>
            This subscription will expire on {getExpiryDate()}
          </Text>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackButton: {
    padding: 6,
    marginRight: 8,
  },
  logo: {
    width: 40,
    height: 40,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  iconsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  expiryText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  subscribeButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  subscribeButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
});
