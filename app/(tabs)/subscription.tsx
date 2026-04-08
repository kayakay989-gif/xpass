import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { Redirect, useRouter } from 'expo-router';
import { ChevronLeft, User as UserIcon } from 'lucide-react-native';
import { TIER_COLORS } from '@/constants/tier-colors';
import { normalizeSubscriptionTier } from '@/lib/subscription-tier';
import { isSubscriptionActiveForMember } from '@/lib/subscription-active';

type Package = {
  tier: 'silver' | 'gold' | 'diamond' | 'elite';
  name: string;
  description: string[];
  baseMonthly: number;
  headerColors: [string, string];
  buttonColors: [string, string];
};

// Use shared tier colors for consistency
const PACKAGE_THEMES: Record<
  Package['tier'],
  {
    cardBg: string;
    border: string;
    title: string;
    price: string;
    desc: string;
    chipBg: string;
    buttonText: string;
  }
> = {
  silver: {
    cardBg: TIER_COLORS.silver.cardBg,
    border: '#E5E7EB',
    title: TIER_COLORS.silver.textOnCard,
    price: TIER_COLORS.silver.primary,
    desc: '#667085',
    chipBg: TIER_COLORS.silver.chipBg,
    buttonText: TIER_COLORS.silver.textOnChip,
  },
  gold: {
    cardBg: TIER_COLORS.gold.cardBg,
    border: '#F3D9B8',
    title: TIER_COLORS.gold.textOnCard,
    price: '#111827',
    desc: '#8B7355',
    chipBg: TIER_COLORS.gold.chipBg,
    buttonText: TIER_COLORS.gold.textOnChip,
  },
  diamond: {
    cardBg: TIER_COLORS.diamond.cardBg,
    border: '#E6E0FF',
    title: TIER_COLORS.diamond.textOnCard,
    price: '#111827',
    desc: '#6B7280',
    chipBg: TIER_COLORS.diamond.chipBg,
    buttonText: TIER_COLORS.diamond.textOnChip,
  },
  elite: {
    cardBg: TIER_COLORS.elite.cardBg,
    border: '#D6E9FF',
    title: TIER_COLORS.elite.textOnCard,
    price: '#111827',
    desc: '#6B7280',
    chipBg: TIER_COLORS.elite.chipBg,
    buttonText: TIER_COLORS.elite.textOnChip,
  },
};

// Exact total prices table
const TOTAL_PRICES: Record<number, Record<Package['tier'], number>> = {
  1: { silver: 65, gold: 90, diamond: 140, elite: 225 },
  3: { silver: 165, gold: 220, diamond: 300, elite: 550 },
  6: { silver: 290, gold: 360, diamond: 480, elite: 900 },
  12: { silver: 520, gold: 635, diamond: 850, elite: 1600 },
};

const PACKAGES: Package[] = [
  {
    tier: 'silver',
    name: 'Silver Package',
    description: ['Access to Silver Tier Gyms only.'],
    baseMonthly: 65,
    headerColors: ['#F5F7FA', '#F5F7FA'],
    buttonColors: ['#E6EEF8', '#E6EEF8'],
  },
  {
    tier: 'gold',
    name: 'Gold Package',
    description: ['Access to Gold & Silver Tier Gyms.'],
    baseMonthly: 90,
    headerColors: ['#FFF3E8', '#FFF3E8'],
    buttonColors: ['#FFE0AE', '#FFE0AE'],
  },
  {
    tier: 'diamond',
    name: 'Diamond Package',
    description: ['Access to Diamond, Gold & Silver Tier Gyms.'],
    baseMonthly: 140,
    headerColors: ['#F4F1FF', '#F4F1FF'],
    buttonColors: ['#E1DAFF', '#E1DAFF'],
  },
  {
    tier: 'elite',
    name: 'Elite Package',
    description: ['Access to all Gym Tiers including Elite gyms.'],
    baseMonthly: 225,
    headerColors: ['#EEF6FF', '#EEF6FF'],
    buttonColors: ['#BFE4FF', '#BFE4FF'],
  },
];

const DURATIONS = [
  { label: '1', subLabel: 'Month', value: 1 },
  { label: '3', subLabel: 'Months', value: 3 },
  { label: '6', subLabel: 'Months', value: 6 },
  { label: '12', subLabel: 'Months', value: 12 },
];

export default function SubscriptionScreen() {
  const { user, firebaseUser, isGuest } = useAuth();
  const { subscription, subscriptionQuery } = useApp();
  const router = useRouter();
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const insets = useSafeAreaInsets();

  const goBackOrFallback = () => {
    const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
    if (canGoBack) return router.back();
    if (isGuest || !firebaseUser) return router.replace('/splash');
    return router.replace('/(tabs)/home');
  };

  const getTotalPrice = useMemo(() => {
    return (tier: Package['tier']) => {
      return TOTAL_PRICES[selectedDuration]?.[tier] ?? 0;
    };
  }, [selectedDuration]);

  if (isGuest || !firebaseUser) {
    return <Redirect href="/login" />;
  }

  const trpcUserId = user?.id || firebaseUser.uid;
  if (trpcUserId && subscriptionQuery.isPending) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 14, fontSize: 15, color: Colors.textSecondary }}>Loading membership…</Text>
      </View>
    );
  }

  const getMonthlyPrice = (tier: Package['tier']): number => {
    const total = getTotalPrice(tier);
    return selectedDuration > 0 ? Math.round(total / selectedDuration) : 0;
  };

  // Get button label and action based on subscription status
  const getPackageButtonInfo = (tier: Package['tier']) => {
    const currentTier = normalizeSubscriptionTier(subscription?.tier);
    const isActive = isSubscriptionActiveForMember(subscription);

    // If user has this tier active
    if (isActive && currentTier === tier) {
      return {
        label: 'Active',
        disabled: true,
        action: null,
      };
    }
    
    // If user has a different tier active - show "Not available until current package expires"
    if (isActive && currentTier && currentTier !== tier) {
      return {
        label: 'Not available until current package expires',
        disabled: true,
        action: null,
      };
    }
    
    // No active subscription - show Select Package
    return {
      label: 'Select Package',
      disabled: false,
      action: () => {
        const totalPrice = getTotalPrice(tier);
        console.log('[Subscription] Selected package:', { tier, duration: selectedDuration, totalPrice });
        const qs = new URLSearchParams({
          tier,
          duration: String(selectedDuration),
          price: String(totalPrice),
        });
        const href = `/payment?${qs.toString()}`;
        try {
          router.push(href as any);
        } catch (e) {
          console.error('[Subscription] router.push failed, retrying:', e);
          router.replace(href as any);
        }
      },
    };
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={goBackOrFallback} style={{ padding: 6 }}>
            <ChevronLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <Image 
            source={require('../../assets/images/main logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.greeting}>
            Hello {user?.name?.split(' ')[0] || firebaseUser?.displayName?.split(' ')[0] || 'User'}
          </Text>
          <View style={styles.iconsContainer}>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => {
                if (!firebaseUser) {
                  router.push('/login');
                } else {
                  router.push('/profile');
                }
              }}
            >
              <UserIcon size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>XPass Packages</Text>

        <View style={styles.durationsContainer}>
          {DURATIONS.map((duration) => (
            <TouchableOpacity
              key={duration.value}
              style={[
                styles.durationButton,
                selectedDuration === duration.value && styles.durationButtonSelected
              ]}
              onPress={() => setSelectedDuration(duration.value)}
            >
              <Text style={[
                styles.durationLabel,
                selectedDuration === duration.value && styles.durationLabelSelected
              ]}>
                {duration.label}
              </Text>
              <Text style={[
                styles.durationSubLabel,
                selectedDuration === duration.value && styles.durationSubLabelSelected
              ]}>
                {duration.subLabel}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {PACKAGES.map((pkg) => {
          const theme = PACKAGE_THEMES[pkg.tier];
          const headerBg = pkg.headerColors[0];
          return (
          <View
            key={pkg.tier}
            style={[
              styles.packageCard,
              { backgroundColor: theme.cardBg, borderColor: theme.border },
            ]}
          >
            <View style={[styles.packageHeader, { backgroundColor: headerBg }]} />
            
            <View style={styles.packageContent}>
              <Text style={[styles.packageName, { color: theme.title }]}>{pkg.name}</Text>
              
              {pkg.description.map((desc, i) => (
                <Text key={i} style={[styles.packageDescription, { color: theme.desc }]}>
                  {desc}
                </Text>
              ))}
              
              <View style={[styles.priceContainer, { borderColor: theme.border, backgroundColor: theme.chipBg }]}>
                <Text style={[styles.price, { color: theme.price }]}>{getTotalPrice(pkg.tier)} JOD</Text>
                {selectedDuration > 1 && (
                  <Text style={styles.priceDetail}>
                    {getMonthlyPrice(pkg.tier)} JOD/month × {selectedDuration} months
                  </Text>
                )}
              </View>
              
              {(() => {
                const buttonInfo = getPackageButtonInfo(pkg.tier);
                return (
                  <TouchableOpacity 
                    onPress={buttonInfo.action || undefined} 
                    activeOpacity={buttonInfo.disabled ? 1 : 0.9}
                    disabled={buttonInfo.disabled}
                  >
                    <View
                      style={[
                        styles.selectButton,
                        buttonInfo.disabled && styles.selectButtonDisabled,
                        {
                          backgroundColor: buttonInfo.disabled ? '#E5E7EB' : pkg.buttonColors[0],
                        },
                      ]}
                    >
                      <Text style={[
                        styles.selectButtonText, 
                        { color: buttonInfo.disabled ? '#9CA3AF' : theme.buttonText }
                      ]}>
                        {buttonInfo.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        )})}
      </ScrollView>
    </View>
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
    width: 48,
    height: 48,
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
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 20,
  },
  durationsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  durationButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  durationButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  durationLabel: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  durationLabelSelected: {
    color: Colors.white,
  },
  durationSubLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  durationSubLabelSelected: {
    color: Colors.white,
  },
  packageCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  packageHeader: {
    height: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  packageContent: {
    padding: 24,
  },
  packageName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  packageDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  priceContainer: {
    alignItems: 'center',
    marginVertical: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignSelf: 'center',
  },
  price: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  selectButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  selectButtonDisabled: {
    opacity: 0.6,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  priceDetail: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
