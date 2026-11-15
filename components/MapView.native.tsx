import { View, StyleSheet, Text, Platform } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import Colors from '@/constants/colors';
import { config } from '@/lib/config';

interface MapViewComponentProps {
  gyms: any[];
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onMarkerPress?: (gym: any) => void;
}

// Check if react-native-maps is available (only in development builds, not Expo Go)
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

try {
  const mapsModule = require('react-native-maps');
  MapView = mapsModule.default;
  Marker = mapsModule.Marker;
  PROVIDER_GOOGLE = mapsModule.PROVIDER_GOOGLE;
} catch (error) {
  // Maps not available (Expo Go)
  console.log('react-native-maps not available, using fallback');
}

function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Firestore often stores lat/lng as strings; Google Maps on Android needs numbers for markers. */
function parseCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type MapGym = any & { id: string; latitude: number; longitude: number };

function normalizeGymForMap(gym: any): MapGym | null {
  const lat = parseCoord(gym?.latitude);
  const lng = parseCoord(gym?.longitude);
  if (lat == null || lng == null || !isValidCoordinate(lat, lng)) return null;
  const rawId = gym?.id != null ? String(gym.id).trim() : '';
  const id = rawId.length > 0 ? rawId : `${lat.toFixed(5)},${lng.toFixed(5)},${gym?.name ?? ''}`;
  return { ...gym, id, latitude: lat, longitude: lng };
}

/**
 * The home screen re-sorts gyms whenever GPS updates. iOS MapKit treats that
 * reorder as remove-and-insert, so pins vanish and a different subset returns.
 * The list keeps its distance order. The map keeps one pin per gym in id order.
 */
function prepareMapGyms(gyms: any[]): MapGym[] {
  if (!Array.isArray(gyms) || gyms.length === 0) return [];
  const seen = new Set<string>();
  const pins: MapGym[] = [];
  for (const gym of gyms) {
    const pin = normalizeGymForMap(gym);
    if (!pin || seen.has(pin.id)) continue;
    seen.add(pin.id);
    pins.push(pin);
  }
  pins.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pins;
}

function pinSignature(pins: MapGym[]): string {
  return pins
    .map((gym) => `${gym.id}\t${gym.latitude}\t${gym.longitude}\t${gym.name ?? ''}\t${gym.address ?? ''}`)
    .join('\n');
}

export default function MapViewComponent({ gyms, initialRegion, onMarkerPress }: MapViewComponentProps) {
  const onPressRef = useRef(onMarkerPress);
  onPressRef.current = onMarkerPress;
  // iOS drops annotations inserted before the map view has a frame, then a later
  // render brings back a different subset.
  const [mapReady, setMapReady] = useState(Platform.OS !== 'ios');
  const mappableGyms = Array.isArray(gyms)
    ? (gyms.map(normalizeGymForMap).filter(Boolean) as MapGym[])
    : [];
  const pins = prepareMapGyms(gyms);
  const signature = pinSignature(pins);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const timer = setTimeout(() => setMapReady(true), 700);
    return () => clearTimeout(timer);
  }, []);

  const markers = useMemo(() => {
    if (!Marker) return null;
    return pins.map((gym) => (
      <Marker
        key={gym.id}
        identifier={gym.id}
        coordinate={{
          latitude: gym.latitude,
          longitude: gym.longitude,
        }}
        title={typeof gym.name === 'string' ? gym.name : undefined}
        description={typeof gym.address === 'string' ? gym.address : undefined}
        // Balloon markers on iOS hide overlapping pins, then show another subset
        // after the map moves. Legacy pins stay where they were placed.
        {...(Platform.OS === 'ios' ? { useLegacyPinView: true, tracksViewChanges: false } : {})}
        onCalloutPress={() => onPressRef.current?.(gym)}
      />
    ));
    // A new gym array with the same pins must not rebuild native markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // If maps are not available (Expo Go), show fallback
  if (!MapView || !Marker) {
    return (
      <View style={styles.mapContainer}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackTitle}>Map View</Text>
          <Text style={styles.fallbackText}>
            {mappableGyms.length || gyms.length}{' '}
            {(mappableGyms.length || gyms.length) === 1 ? 'gym' : 'gyms'} nearby
          </Text>
          <View style={styles.gymList}>
            {(mappableGyms.length > 0 ? mappableGyms : gyms).slice(0, 3).map((gym) => (
              <View key={gym.id} style={styles.gymItem}>
                <Text style={styles.gymName}>{gym.name}</Text>
                <Text style={styles.gymAddress}>{gym.address}</Text>
              </View>
            ))}
            {(mappableGyms.length > 0 ? mappableGyms : gyms).length > 3 && (
              <Text style={styles.moreText}>
                +{(mappableGyms.length > 0 ? mappableGyms : gyms).length - 3} more gyms
              </Text>
            )}
          </View>
          <Text style={styles.noteText}>
            Full map view available in production build
          </Text>
        </View>
      </View>
    );
  }

  const mapsApiKey =
    (config.googleMaps.apiKey && config.googleMaps.apiKey !== 'REPLACE_ME'
      ? String(config.googleMaps.apiKey).trim()
      : '') ||
    (typeof Constants.expoConfig?.extra?.googleMapsApiKey === 'string'
      ? String(Constants.expoConfig.extra.googleMapsApiKey).trim()
      : '');

  // Android: Google Maps. iOS: use Google Maps when an API key is present (Expo injects `ios.config.googleMapsApiKey` at prebuild).
  const useGoogleOnIos =
    Platform.OS === 'ios' && !!mapsApiKey && PROVIDER_GOOGLE != null;

  const mapProvider =
    Platform.OS === 'android'
      ? PROVIDER_GOOGLE ?? undefined
      : useGoogleOnIos
        ? PROVIDER_GOOGLE
        : undefined;

  // Use native maps if available
  return (
    <View style={styles.mapContainer} collapsable={false}>
      <MapView
        provider={mapProvider}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        mapType="standard"
        loadingEnabled
        // Avoid Fabric reparenting glitches when the map sits inside a ScrollView.
        removeClippedSubviews={false}
        onMapReady={() => setMapReady(true)}
      >
        {mapReady ? markers : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  fallbackText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  gymList: {
    width: '100%',
    alignItems: 'flex-start',
  },
  gymItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    width: '100%',
  },
  gymName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  gymAddress: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  moreText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  noteText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 16,
    textAlign: 'center',
  },
});
