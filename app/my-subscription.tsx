import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

export default function MySubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { subscription } = useApp();

  if (!subscription) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Image 
              source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.headerRight}>
              <Text style={styles.greeting}>Hello {user?.name?.split(' ')[0] || 'Hamza'}</Text>
              <View style={styles.iconsContainer}>
                <View style={styles.languageButton}>
                  <Text style={styles.languageText}>EN</Text>
                </View>
                <View style={styles.profileButton}>
                  <Text style={styles.profileIcon}>👤</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.emptyText}>No active subscription</Text>
            <TouchableOpacity 
              style={styles.subscribeButton}
              onPress={() => router.push('/(tabs)/subscription')}
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
    return subscription.maxVisitsPerMonth - subscription.visitsUsed;
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Image 
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerRight}>
            <Text style={styles.greeting}>Hello {user?.name?.split(' ')[0] || 'Hamza'}</Text>
            <View style={styles.iconsContainer}>
              <View style={styles.languageButton}>
                <Text style={styles.languageText}>EN</Text>
              </View>
              <View style={styles.profileButton}>
                <Text style={styles.profileIcon}>👤</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.titleContainer}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={24} color={Colors.text} />
            </TouchableOpacity>
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

          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Selected</Text>
              <Text style={styles.priceValue}>Monthly Active</Text>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal</Text>
              <Text style={styles.priceValue}>65.00 JOD</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total due today</Text>
              <Text style={styles.totalValue}>65.00 JOD</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.upgradeButton}>
            <Text style={styles.upgradeButtonText}>Upgrade Tier</Text>
          </TouchableOpacity>

          <Text style={styles.renewalText}>
            Subscription auto renews on {getExpiryDate()}
          </Text>

          <TouchableOpacity>
            <Text style={styles.cancelText}>Cancel Subscription</Text>
          </TouchableOpacity>
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
  languageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIcon: {
    fontSize: 18,
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
    gap: 8,
  },
  backButton: {
    padding: 4,
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
  priceCard: {
    backgroundColor: Colors.black,
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '500' as const,
  },
  priceValue: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '500' as const,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 18,
    color: Colors.white,
    fontWeight: '700' as const,
  },
  totalValue: {
    fontSize: 18,
    color: Colors.white,
    fontWeight: '700' as const,
  },
  upgradeButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  renewalText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  cancelText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
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
