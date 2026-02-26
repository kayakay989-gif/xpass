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
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, Clock, ChevronLeft, QrCode } from 'lucide-react-native';
import { firestoreGyms } from '@/lib/firestore';
import { getGymTier, getTierBadgeColors, getTierLabel } from '@/lib/gym-tier';
import Colors from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { calculateDistance, formatDistance } from '@/lib/distance';

export default function GymDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gymId } = useLocalSearchParams<{ gymId?: string }>();
  const [gym, setGym] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

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
  const galleryImages: string[] = Array.isArray((gym as any).gymImages)
    ? (gym as any).gymImages
    : [];
  const heroImage =
    (galleryImages.length > 0 && galleryImages[0]) ||
    gym.imageUrl ||
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800';

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
        <Image
          source={{ uri: heroImage }}
          style={styles.gymImage}
          resizeMode="cover"
        />

        {/* Gym Image Gallery */}
        {galleryImages.length > 1 && (
          <View style={styles.gallerySection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {galleryImages.map((url, index) => (
                <Image
                  key={`${url}-${index}`}
                  source={{ uri: url }}
                  style={styles.galleryImage}
                  resizeMode="cover"
                />
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

          {/* Hours */}
          <View style={styles.infoRow}>
            <Clock size={18} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{gym.hours || '6:00 AM - 10:00 PM'}</Text>
          </View>
        </View>

        {/* Facilities Section */}
        {gym.amenities && gym.amenities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Facilities</Text>
            <View style={styles.facilitiesGrid}>
              {gym.amenities.map((amenity: string, index: number) => (
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
            <Text style={styles.sectionTitle}>Available Tiers</Text>
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

        {/* Check-in Button */}
        <TouchableOpacity
          style={styles.checkInButton}
          onPress={() => {
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
});
