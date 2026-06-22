import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, TextInput, RefreshControl } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, Search, Filter } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { SubscriptionTier } from '@/types';
import { getGymTier, getTierBadgeColors, getTierLabel } from '@/lib/gym-tier';
import { calculateDistance, formatDistance } from '@/lib/distance';

export default function GymsScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams<{ gymId?: string }>();
  const { filteredGyms, selectedGymFilter, setSelectedGymFilter, refetchGyms, isLoading, gymsError } = useApp();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [gymDistances, setGymDistances] = useState<Record<string, number>>({});

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchGyms();
    } finally {
      setRefreshing(false);
    }
  };

  // Request location permission and get user's current location once per screen session
  useEffect(() => {
    let cancelled = false;

    const requestLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (cancelled) return;

        if (status !== 'granted') {
          setLocationPermissionDenied(true);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelled) return;

        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        setLocationPermissionDenied(false);
      } catch (error) {
        console.error('[Gyms] Error getting location:', error);
        if (!cancelled) {
          setLocationPermissionDenied(true);
        }
      }
    };

    requestLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  const filters: Array<{ label: string; value: SubscriptionTier | 'all' }> = [
    { label: 'All', value: 'all' },
    { label: 'Silver', value: 'silver' },
    { label: 'Gold', value: 'gold' },
    { label: 'Diamond', value: 'diamond' },
    { label: 'Elite', value: 'elite' },
  ];

  // Cache distances per gym during the session to avoid recalculating
  useEffect(() => {
    if (!userLocation || !filteredGyms || filteredGyms.length === 0) return;

    setGymDistances((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };

      filteredGyms.forEach((gym: any) => {
        if (next[gym.id] != null) {
          return;
        }

        const gymLat = typeof gym.latitude === 'string' ? parseFloat(gym.latitude) : gym.latitude;
        const gymLon = typeof gym.longitude === 'string' ? parseFloat(gym.longitude) : gym.longitude;

        if (!Number.isFinite(gymLat) || !Number.isFinite(gymLon)) {
          return;
        }

        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          gymLat,
          gymLon
        );

        next[gym.id] = distance;
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [userLocation, filteredGyms]);

  const displayedGyms = filteredGyms.filter(gym => 
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If we have location and distances, sort gyms by distance (nearest first).
  // If permission is denied or location is unavailable, keep the original order.
  const distanceSortedGyms = useMemo(() => {
    if (!userLocation || locationPermissionDenied) {
      return displayedGyms;
    }

    return [...displayedGyms]
      .map((gym: any) => ({
        gym,
        distance: gymDistances[gym.id] ?? Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distance - b.distance)
      .map((item) => item.gym);
  }, [displayedGyms, userLocation, locationPermissionDenied, gymDistances]);

  const orderedGyms = gymId
    ? [...distanceSortedGyms].sort((a, b) => (a.id === gymId ? -1 : b.id === gymId ? 1 : 0))
    : distanceSortedGyms;

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search gyms..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[
                styles.filterChip,
                selectedGymFilter === filter.value && styles.filterChipActive
              ]}
              onPress={() => setSelectedGymFilter(filter.value)}
            >
              <Text style={[
                styles.filterText,
                selectedGymFilter === filter.value && styles.filterTextActive
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.gymList}
        contentContainerStyle={styles.gymListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.black}
          />
        }
      >
        {!!gymsError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>Couldn’t load gyms</Text>
            <Text style={styles.errorText}>{gymsError}</Text>
          </View>
        )}
        {orderedGyms.map((gym) => {
          const tier = getGymTier(gym);
          const badge = getTierBadgeColors(tier);
          const label = getTierLabel(tier);
          const rawGallery: string[] = Array.isArray((gym as any).gymImages)
            ? (gym as any).gymImages
            : [];
          const galleryImages: string[] = rawGallery.filter(
            (url) => typeof url === 'string' && !url.startsWith('blob:')
          );
          const heroImage =
            (galleryImages.length > 0 && galleryImages[0]) ||
            'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800';
          const logoUrl =
            typeof gym.imageUrl === 'string' && !gym.imageUrl.startsWith('blob:')
              ? gym.imageUrl
              : null;
          const facilities: string[] =
            Array.isArray((gym as any).facilities) && (gym as any).facilities.length > 0
              ? (gym as any).facilities
              : Array.isArray((gym as any).amenities)
              ? (gym as any).amenities
              : [];

          return (
          <TouchableOpacity 
            key={gym.id} 
            style={styles.gymCard}
            onPress={() => {
              router.push({
                pathname: '/gym-details',
                params: { gymId: gym.id },
              } as any);
            }}
          >
            <View style={styles.gymImageWrapper}>
              <Image 
                source={{ uri: heroImage }} 
                style={styles.gymImage}
                resizeMode="cover"
              />
              {logoUrl && (
                <View style={styles.gymLogoBadge}>
                  <Image
                    source={{ uri: logoUrl }}
                    style={styles.gymLogoImage}
                    resizeMode="cover"
                  />
                </View>
              )}
            </View>
            <View style={styles.gymInfo}>
              <View style={styles.gymHeader}>
                <Text style={styles.gymName}>{gym.name}</Text>
                <View style={[styles.categoryBadge, { backgroundColor: badge.backgroundColor }]}>
                  <Text style={[styles.categoryText, { color: badge.textColor }]}>{label.toUpperCase()}</Text>
                </View>
              </View>
              
              <View style={styles.locationRow}>
                <MapPin size={14} color={Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationText}>{gym.address}</Text>
                  {!!userLocation && !locationPermissionDenied && typeof gymDistances[gym.id] === 'number' && (
                    <Text style={styles.distanceText}>{formatDistance(gymDistances[gym.id] as number)} away</Text>
                  )}
                </View>
              </View>

              {facilities.length > 0 && (
                <View style={styles.amenitiesRow}>
                  {facilities.slice(0, 3).map((amenity, index) => (
                    <View key={index} style={styles.amenityTag}>
                      <Text style={styles.amenityText}>{amenity}</Text>
                    </View>
                  ))}
                  {facilities.length > 3 && (
                    <View style={styles.amenityTag}>
                      <Text style={styles.moreAmenities}>+{facilities.length - 3}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
          );
        })}

        {orderedGyms.length === 0 && (
          <View style={styles.emptyState}>
            <Filter size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {gymsError ? 'Unable to load gyms' : 'No gyms found'}
            </Text>
            <Text style={styles.emptySubtext}>
              {gymsError ? 'Pull to refresh or try again later.' : 'Try adjusting your filters'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchSection: {
    padding: 20,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: Colors.text,
  },
  filterScroll: {
    marginHorizontal: -20,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  filterTextActive: {
    color: Colors.white,
  },
  gymList: {
    flex: 1,
  },
  gymListContent: {
    padding: 20,
    paddingTop: 8,
  },
  gymCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gymImageWrapper: {
    position: 'relative',
  },
  gymImage: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.surface,
  },
  gymLogoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.white,
    backgroundColor: Colors.background,
  },
  gymLogoImage: {
    width: '100%',
    height: '100%',
  },
  gymInfo: {
    padding: 16,
  },
  gymHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  gymName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginRight: 12,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.background,
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  distanceText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600' as const,
    marginLeft: 6,
    marginTop: 2,
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 6,
  },
  amenityTag: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  amenityText: {
    fontSize: 12,
    color: Colors.text,
  },
  moreAmenities: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  hoursText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#991B1B',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
  },
});
