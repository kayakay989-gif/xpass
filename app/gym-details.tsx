import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  Linking,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, Clock, ChevronLeft, QrCode, X, Navigation } from 'lucide-react-native';
import { firestoreGyms } from '@/lib/firestore';
import { getGymTier, getTierBadgeColors, getTierLabel } from '@/lib/gym-tier';
import Colors from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import ImageGalleryViewer from '@/components/ImageGalleryViewer';

export default function GymDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gymId } = useLocalSearchParams<{ gymId?: string }>();
  const [gym, setGym] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { isGuest, firebaseUser } = useAuth();
  const { subscription } = useApp();

  useEffect(() => {
    if (gymId) {
      loadGymDetails();
    }
  }, [gymId]);

  // Request location permission and get user's current location
  useEffect(() => {
    let cancelled = false;

    const requestLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (cancelled) return;

        if (status !== 'granted') {
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
      } catch (error) {
        console.error('[GymDetails] Error getting location:', error);
      }
    };

    requestLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  // Calculate distance when gym and user location are available
  useEffect(() => {
    if (gym && userLocation) {
      const gymLat = typeof gym.latitude === 'string' ? parseFloat(gym.latitude) : gym.latitude;
      const gymLon = typeof gym.longitude === 'string' ? parseFloat(gym.longitude) : gym.longitude;
      
      if (Number.isFinite(gymLat) && Number.isFinite(gymLon)) {
        const calculatedDistance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          gymLat,
          gymLon
        );
        setDistance(calculatedDistance);
      }
    }
  }, [gym, userLocation]);

  const loadGymDetails = async () => {
    if (!gymId) return;
    
    setIsLoading(true);
    try {
      const gymData = await firestoreGyms.getById(gymId);
      if (gymData) {
        setGym(gymData);
      } else {
        Alert.alert('Error', 'Gym not found', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      console.error('[GymDetails] Error loading gym:', error);
      Alert.alert('Error', 'Failed to load gym details', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Gym Details',
            headerShown: true,
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ paddingLeft: 16 }}
              >
                <ChevronLeft size={24} color={Colors.text} />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={[styles.container, styles.centerContent]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading gym details...</Text>
        </View>
      </>
    );
  }

  if (!gym) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Gym Details',
            headerShown: true,
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ paddingLeft: 16 }}
              >
                <ChevronLeft size={24} color={Colors.text} />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={[styles.container, styles.centerContent]}>
          <Text style={styles.errorText}>Gym not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const tier = getGymTier(gym);
  const badge = getTierBadgeColors(tier);
  const tierLabel = getTierLabel(tier);
  const rawGallery: string[] = Array.isArray((gym as any).gymImages)
    ? (gym as any).gymImages
    : [];
  const galleryImages: string[] = rawGallery.filter(
    (url) => typeof url === 'string' && !url.startsWith('blob:')
  );
  const safeLogo =
    typeof gym.imageUrl === 'string' && !gym.imageUrl.startsWith('blob:')
      ? gym.imageUrl
      : null;
  
  // Combine all images: hero (logo) first, then gallery images
  // If no gallery images, use logo as hero; if no logo, use fallback
  const allImages: string[] = [];
  if (safeLogo) {
    allImages.push(safeLogo);
  }
  // Add gallery images, but skip the first one if it's the same as the logo
  galleryImages.forEach((url) => {
    if (url !== safeLogo && !allImages.includes(url)) {
      allImages.push(url);
    }
  });
  
  // If no images at all, use fallback
  const heroImage = allImages.length > 0 
    ? allImages[0]
    : 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800';
  
  // Ensure fallback is in the array if needed
  if (allImages.length === 0) {
    allImages.push(heroImage);
  }
  const facilities: string[] =
    Array.isArray((gym as any).facilities) && (gym as any).facilities.length > 0
      ? (gym as any).facilities
      : Array.isArray((gym as any).amenities)
      ? (gym as any).amenities
      : [];
  const timings: any = (gym as any).timings || {};
  const openDays: string[] = Array.isArray((gym as any).openDays)
    ? (gym as any).openDays
    : [];
  const hasMenTimings = !!(timings.men && (timings.men.from || timings.men.to));
  const hasWomenTimings = !!(timings.women && (timings.women.from || timings.women.to));
  const hasMixedTimings = !!(timings.mixed && (timings.mixed.from || timings.mixed.to));
  const menOnly = !!(gym as any).menOnly;
  const womenOnly = !!(gym as any).womenOnly;

  const renderTimingLine = (label: string, value: any) => {
    const from: string = (value?.from || '').trim();
    const to: string = (value?.to || '').trim();
    if (!from && !to) return null;
    const text = from && to ? `${from} – ${to}` : from || to;
    if (!text) return null;
    return (
      <View style={styles.timingRow}>
        <Text style={styles.timingLabel}>{label}</Text>
        <Text style={styles.timingValue}>{text}</Text>
      </View>
    );
  };

  const openGoogleMaps = async () => {
    try {
      const gymLat = typeof gym.latitude === 'string' ? parseFloat(gym.latitude) : gym.latitude;
      const gymLon = typeof gym.longitude === 'string' ? parseFloat(gym.longitude) : gym.longitude;
      const hasCoordinates = Number.isFinite(gymLat) && Number.isFinite(gymLon);
      
      let mapsUrl: string;
      
      if (hasCoordinates) {
        // Use coordinates for navigation
        mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${gymLat},${gymLon}`;
      } else if (gym.address) {
        // Fallback to address search
        const encodedAddress = encodeURIComponent(gym.address);
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      } else {
        Alert.alert('Location Not Available', 'This gym does not have location information available.');
        return;
      }

      // Open Google Maps
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Open in new tab on web
        window.open(mapsUrl, '_blank');
      } else {
        // Open with Linking on mobile (will open Google Maps app if installed, otherwise browser)
        const canOpen = await Linking.canOpenURL(mapsUrl);
        if (canOpen) {
          await Linking.openURL(mapsUrl);
        } else {
          Alert.alert('Error', 'Unable to open Google Maps. Please install Google Maps app.');
        }
      }
    } catch (error: any) {
      console.error('[GymDetails] Error opening Google Maps:', error);
      Alert.alert('Error', 'Failed to open Google Maps. Please try again.');
    }
  };

  // Check if location data is available
  const hasLocationData = () => {
    const gymLat = typeof gym.latitude === 'string' ? parseFloat(gym.latitude) : gym.latitude;
    const gymLon = typeof gym.longitude === 'string' ? parseFloat(gym.longitude) : gym.longitude;
    const hasCoordinates = Number.isFinite(gymLat) && Number.isFinite(gymLon);
    return hasCoordinates || !!gym.address;
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: gym.name,
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingLeft: 16 }}
            >
              <ChevronLeft size={24} color={Colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Gym Image / Gallery hero */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            setSelectedImageIndex(0);
            setImageViewerVisible(true);
          }}
        >
          <Image
            source={{ uri: heroImage }}
            style={styles.gymImage}
            resizeMode="cover"
          />
        </TouchableOpacity>

        {/* Gym Image Gallery */}
        {allImages.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Images</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.galleryScrollView}
            >
              {allImages.map((url, index) => (
                <TouchableOpacity
                  key={`${url}-${index}`}
                  activeOpacity={0.9}
                  onPress={() => {
                    setSelectedImageIndex(index);
                    setImageViewerVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Gym Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.headerRow}>
            <Text style={styles.gymName}>{gym.name}</Text>
            <View style={[styles.tierBadge, { backgroundColor: badge.backgroundColor }]}>
              <Text style={[styles.tierText, { color: badge.textColor }]}>
                {tierLabel.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Address */}
          <View style={styles.infoRow}>
            <MapPin size={18} color={Colors.textSecondary} />
            <View style={styles.addressContainer}>
              <Text style={styles.infoText}>{gym.address}</Text>
              {distance !== null && (
                <Text style={styles.distanceText}>{formatDistance(distance)} away</Text>
              )}
            </View>
          </View>

          {/* City */}
          {gym.city && (
            <View style={styles.infoRow}>
              <MapPin size={18} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{gym.city}</Text>
            </View>
          )}

          {/* Open in Google Maps Button */}
          {hasLocationData() ? (
            <TouchableOpacity
              style={styles.mapsButton}
              onPress={openGoogleMaps}
              activeOpacity={0.8}
            >
              <Navigation size={20} color={Colors.white} />
              <Text style={styles.mapsButtonText}>Open in Google Maps</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.mapsButtonDisabled}>
              <MapPin size={20} color={Colors.textMuted} />
              <Text style={styles.mapsButtonTextDisabled}>Location not available</Text>
            </View>
          )}

        </View>

        {/* Facilities Section */}
        {facilities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Facilities</Text>
            <View style={styles.facilitiesGrid}>
              {facilities.map((amenity: string, index: number) => (
                <View key={index} style={styles.facilityTag}>
                  <Text style={styles.facilityText}>{amenity}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Allowed Tiers */}
        {gym.allowedTiers && gym.allowedTiers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accessibility</Text>
            <View style={styles.tiersRow}>
              {gym.allowedTiers.map((tier: string, index: number) => {
                const tierBadge = getTierBadgeColors(tier as any);
                const tierName = getTierLabel(tier as any);
                return (
                  <View
                    key={index}
                    style={[styles.tierChip, { backgroundColor: tierBadge.backgroundColor }]}
                  >
                    <Text style={[styles.tierChipText, { color: tierBadge.textColor }]}>
                      {tierName}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Timings & Access */}
        {(hasMenTimings ||
          hasWomenTimings ||
          hasMixedTimings ||
          openDays.length > 0 ||
          menOnly ||
          womenOnly) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Timings & Access</Text>

            {openDays.length > 0 && (
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Open Days</Text>
                <Text style={styles.timingValue}>{openDays.join(', ')}</Text>
              </View>
            )}

            {renderTimingLine('Men', timings.men)}
            {renderTimingLine('Women', timings.women)}
            {renderTimingLine('Mixed', timings.mixed)}

            {(menOnly || womenOnly) && (
              <View style={styles.accessPillsRow}>
                {menOnly && (
                  <View style={styles.accessPill}>
                    <Text style={styles.accessPillText}>Men only</Text>
                  </View>
                )}
                {womenOnly && (
                  <View style={styles.accessPill}>
                    <Text style={styles.accessPillText}>Women only</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Check-in Button */}
        <TouchableOpacity
          style={styles.checkInButton}
          onPress={() => {
            if (isGuest || !firebaseUser) {
              Alert.alert(
                'Account Required',
                'Please log in and subscribe to check in to gyms.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Log In', onPress: () => router.push('/login' as any) },
                ]
              );
              return;
            }

            if (!subscription) {
              router.push('/(tabs)/subscription' as any);
              return;
            }

            router.push({
              pathname: '/qr-scanner',
              params: { gymId: gym.id },
            } as any);
          }}
        >
          <QrCode size={20} color={Colors.white} />
          <Text style={styles.checkInButtonText}>Check In</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Image Gallery Viewer */}
      <ImageGalleryViewer
        visible={imageViewerVisible}
        images={allImages}
        initialIndex={selectedImageIndex}
        onClose={() => setImageViewerVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 18,
    color: Colors.text,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  gymImage: {
    width: '100%',
    height: 250,
    backgroundColor: Colors.surface,
  },
  gallerySection: {
    backgroundColor: Colors.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  galleryImage: {
    width: 140,
    height: 100,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  infoCard: {
    backgroundColor: Colors.white,
    padding: 20,
    marginTop: -20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  gymName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 12,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  addressContainer: {
    flex: 1,
  },
  infoText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  distanceText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    backgroundColor: Colors.white,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  facilitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  facilityTag: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  facilityText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  timingValue: {
    fontSize: 14,
    color: Colors.text,
  },
  accessPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  accessPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.surface,
  },
  accessPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tiersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tierChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkInButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 12,
    gap: 8,
  },
  checkInButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  galleryScrollView: {
    marginTop: -16,
  },
  mapsButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  mapsButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  mapsButtonDisabled: {
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
    opacity: 0.6,
  },
  mapsButtonTextDisabled: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
});
