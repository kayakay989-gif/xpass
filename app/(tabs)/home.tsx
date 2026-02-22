import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, User as UserIcon } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { useState, useMemo, useEffect } from 'react';
import MapViewComponent from '@/components/MapView';
import { getGymTier, getTierLabel } from '@/lib/gym-tier';
import { firestoreSpotlightBanners } from '@/lib/firestore';

type ViewMode = 'map' | 'list';

export default function HomeScreen() {
  const router = useRouter();
  const { user, firebaseUser, isGuest, isLoading: isLoadingAuth } = useAuth();
  const { subscription, gyms, isLoading } = useApp();
  const [spotlightBanners, setSpotlightBanners] = useState<any[]>([]);
  const [isLoadingBanners, setIsLoadingBanners] = useState(true);

  useEffect(() => {
    // On web, Firebase Auth can be ready before the Firestore user profile loads.
    // Guard routes based on firebaseUser (auth session), not on the Firestore profile object.
    if (!isLoadingAuth && !firebaseUser && !isGuest) {
      router.replace('/splash');
    }
  }, [firebaseUser, isGuest, isLoadingAuth, router]);

  useEffect(() => {
    const loadBanners = async () => {
      try {
        setIsLoadingBanners(true);
        const banners = await firestoreSpotlightBanners.getAll();
        
        setSpotlightBanners(banners);
      } catch (error) {
        console.error('[Home] Error loading spotlight banners:', error);
      } finally {
        setIsLoadingBanners(false);
      }
    };
    loadBanners();
  }, []);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all'); // all|silver|gold|diamond|elite
  const [selectedFacility, setSelectedFacility] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'city' | 'tier' | 'facility' | null>(null);

  const promptCreateAccount = () => {
    const goToLogin = () => router.push('/login');

    // `Alert.alert` can be flaky on some mobile web browsers; use confirm() as a fallback.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm('Create an account to subscribe.\n\nWould you like to log in / sign up now?');
      if (ok) goToLogin();
      return;
    }

    Alert.alert(
      'Create account',
      'Please log in or create an account to subscribe.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log in / Sign up', onPress: goToLogin },
      ]
    );
  };

  const filteredGyms = useMemo(() => {
    const norm = (v: any) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
    return gyms.filter((gym: any) => {
      const gymCity = norm(gym.city);
      const allowedTiers = Array.isArray(gym.allowedTiers) ? gym.allowedTiers.map(norm) : [];
      const amenities = Array.isArray(gym.amenities)
        ? gym.amenities.map((a: any) => (typeof a === 'string' ? a.trim().toLowerCase() : String(a).toLowerCase()))
        : [];

      const cityMatch = selectedCity === 'all' || gymCity === norm(selectedCity);
      const tierMatch = selectedTier === 'all' || allowedTiers.includes(norm(selectedTier));
      const facilityMatch = selectedFacility === 'all' || amenities.includes(norm(selectedFacility));
      return cityMatch && tierMatch && facilityMatch;
    });
  }, [gyms, selectedCity, selectedTier, selectedFacility]);

  // Spotlight banners are now loaded from Firestore, not from gyms

  const getTierName = (tier: string): string => {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  };

  const cityOptions = useMemo(() => {
    const cities = Array.from(
      new Set((gyms || []).map((g: any) => (typeof g.city === 'string' ? g.city.trim() : '')).filter(Boolean))
    );
    return ['all', ...cities];
  }, [gyms]);

  const facilityOptions = useMemo(() => {
    const all = (gyms || []).flatMap((g: any) => (Array.isArray(g.amenities) ? g.amenities : []));
    const normalized = all
      .map((a: any) => (typeof a === 'string' ? a.trim() : String(a)))
      .filter((a: string) => a.length > 0);
    const unique = Array.from(new Set(normalized));
    return ['all', ...unique];
  }, [gyms]);

  const tierOptions = useMemo(() => ['all', 'silver', 'gold', 'diamond', 'elite'], []);

  const openFromMarker = (gym: any) => {
    if (isGuest || !subscription) {
      Alert.alert(
        'Subscription Required',
        'Please subscribe to access gym details and check-in features.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Subscribe', onPress: () => router.push('/subscription') },
        ]
      );
      return;
    }
    router.push(`/gyms?gymId=${encodeURIComponent(gym.id)}`);
  };

  const initialRegion = {
    latitude: 31.9539,
    longitude: 35.9106,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>
            Hello{' '}
            {user?.name?.split(' ')[0] ||
              firebaseUser?.displayName?.split(' ')[0] ||
              firebaseUser?.email?.split('@')[0] ||
              (isGuest ? 'Guest' : 'Member')}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.languageButton}>
            <Text style={styles.languageText}>EN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileButton} onPress={() => {
            // Consider the user logged in if Firebase Auth session exists,
            // even if the Firestore profile hasn't loaded yet.
            if (isGuest || !firebaseUser) {
              router.push('/login');
            } else {
              router.push('/profile');
            }
          }}>
            <UserIcon size={16} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dashboardTitle}>
        <Text style={styles.dashboardText}>Home Dashboard</Text>
      </View>

      {subscription ? (
        <View style={styles.subscriptionCard}>
          <View style={styles.cardRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Passes Remaining</Text>
              <Text style={styles.statValue}>{subscription.maxVisitsPerMonth - subscription.visitsUsed} / {subscription.maxVisitsPerMonth}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Tier</Text>
              <Text style={styles.tierValue}>{getTierName(subscription.tier)}</Text>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity 
          style={styles.noSubscriptionCard}
          onPress={() => {
            if (isGuest || !firebaseUser) {
              promptCreateAccount();
              return;
            }
            router.push('/(tabs)/subscription');
          }}
        >
          <Text style={styles.noSubTitle}>No Active Subscription</Text>
          <Text style={styles.noSubText}>Tap to choose a plan</Text>
        </TouchableOpacity>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spotlight</Text>
      </View>
      
      {isLoadingBanners ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : spotlightBanners.length > 0 ? (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.spotlightContainer}
          contentContainerStyle={styles.spotlightContent}
        >
          {spotlightBanners.map((banner) => (
            <TouchableOpacity 
              key={banner.id} 
              style={styles.spotlightCard}
              onPress={() => {
                if (banner.linkUrl) {
                  if (banner.linkUrl.startsWith('http')) {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open(banner.linkUrl, '_blank');
                    }
                  } else {
                    router.push(banner.linkUrl as any);
                  }
                }
              }}
            >
              <Image 
                source={{ uri: banner.imageUrl }} 
                style={styles.spotlightImage}
                resizeMode="cover"
              />
              {banner.title && (
                <View style={styles.spotlightOverlay}>
                  <View style={styles.spotlightBadge}>
                    <Text style={styles.spotlightBadgeText}>
                      {banner.title.toUpperCase()}
                    </Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Discover</Text>
      </View>

      <View style={styles.toggleContainer}>
        <TouchableOpacity 
          style={[styles.toggleButton, viewMode === 'map' && styles.toggleButtonActive]}
          onPress={() => setViewMode('map')}
        >
          <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>Map</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
          onPress={() => setViewMode('list')}
        >
          <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'map' ? (
        <MapViewComponent 
          gyms={filteredGyms}
          initialRegion={initialRegion}
          onMarkerPress={(gym) => openFromMarker(gym)}
        />
      ) : (
        <View style={styles.listContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : filteredGyms.length > 0 ? (
            filteredGyms.map((gym) => (
              <TouchableOpacity 
                key={gym.id} 
                style={styles.gymCard}
                onPress={() => {
                  if (isGuest || !subscription) {
                    Alert.alert(
                      'Subscription Required',
                      'Please subscribe to access gym details and check-in features.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Subscribe', onPress: () => router.push('/(tabs)/subscription') },
                      ]
                    );
                  } else {
                    router.push('/gyms');
                  }
                }}
              >
                <Image source={{ uri: gym.imageUrl }} style={styles.gymImage} />
                <View style={styles.gymInfo}>
                  <Text style={styles.gymName}>{gym.name}</Text>
                  <Text style={styles.gymAddress}>{gym.address}</Text>
                  <View style={styles.gymCategory}>
                    <Text style={styles.gymCategoryText}>
                      {getTierLabel(getGymTier(gym))}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyText}>No gyms found</Text>
          )}
        </View>
      )}

      <View style={styles.filtersContainer}>
        <TouchableOpacity style={styles.filterButton} onPress={() => setActiveFilter('city')}>
          <Text style={styles.filterLabel}>{selectedCity === 'all' ? 'City' : selectedCity}</Text>
          <ChevronDown size={16} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton} onPress={() => setActiveFilter('tier')}>
          <Text style={styles.filterLabel}>{selectedTier === 'all' ? 'Tier' : getTierName(selectedTier)}</Text>
          <ChevronDown size={16} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton} onPress={() => setActiveFilter('facility')}>
          <Text style={styles.filterLabel}>{selectedFacility === 'all' ? 'Facilities' : selectedFacility}</Text>
          <ChevronDown size={16} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <Modal visible={!!activeFilter} transparent animationType="fade" onRequestClose={() => setActiveFilter(null)}>
        <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setActiveFilter(null)}>
          <View style={styles.filterSheet}>
            <Text style={styles.filterSheetTitle}>
              {activeFilter === 'city' ? 'City' : activeFilter === 'tier' ? 'Tier' : 'Facilities'}
            </Text>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {(activeFilter === 'city'
                ? cityOptions
                : activeFilter === 'tier'
                ? tierOptions
                : facilityOptions
              ).map((opt) => {
                const label =
                  opt === 'all'
                    ? 'All'
                    : activeFilter === 'tier'
                    ? getTierName(opt)
                    : opt;
                const isSelected =
                  (activeFilter === 'city' && selectedCity === opt) ||
                  (activeFilter === 'tier' && selectedTier === opt) ||
                  (activeFilter === 'facility' && selectedFacility === opt);

                return (
                  <TouchableOpacity
                    key={`${activeFilter}-${opt}`}
                    style={[styles.filterOption, isSelected && styles.filterOptionSelected]}
                    onPress={() => {
                      if (activeFilter === 'city') setSelectedCity(opt);
                      if (activeFilter === 'tier') setSelectedTier(opt);
                      if (activeFilter === 'facility') setSelectedFacility(opt);
                      setActiveFilter(null);
                    }}
                  >
                    <Text style={[styles.filterOptionText, isSelected && styles.filterOptionTextSelected]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.filterClose} onPress={() => setActiveFilter(null)}>
              <Text style={styles.filterCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.white,
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
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.white,
  },
  dashboardTitle: {
    marginBottom: 16,
  },
  dashboardText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  subscriptionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  tierValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  noSubscriptionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noSubTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  noSubText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotlightContainer: {
    marginBottom: 24,
  },
  spotlightContent: {
    paddingRight: 16,
  },
  spotlightCard: {
    width: 240,
    height: 140,
    borderRadius: 16,
    marginRight: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  spotlightImage: {
    width: '100%',
    height: '100%',
  },
  spotlightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    padding: 12,
  },
  spotlightBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  spotlightBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  spotlightText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: Colors.white,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: Colors.text,
  },

  listContainer: {
    marginBottom: 16,
  },
  gymCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gymImage: {
    width: '100%',
    height: 120,
  },
  gymInfo: {
    padding: 12,
  },
  gymName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  gymAddress: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  gymCategory: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  gymCategoryText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.text,
    textTransform: 'uppercase',
  },
  filtersContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: Colors.white,
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  filterSheetTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  filterOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  filterOptionSelected: {
    backgroundColor: Colors.surface,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  filterOptionTextSelected: {
    color: Colors.primary,
  },
  filterClose: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Colors.black,
  },
  filterCloseText: {
    color: Colors.white,
    fontWeight: '700' as const,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
