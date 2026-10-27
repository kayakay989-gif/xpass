import { View, StyleSheet, Text, Platform } from 'react-native';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useIsFocused } from '@react-navigation/native';
import Colors from '@/constants/colors';

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

type MapGym = any & { id: string; latitude: number; longitude: number };

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

/** Firestore often stores lat/lng as strings; both map providers need finite numbers. */
function parseCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    const record = value as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown };
    if ('latitude' in record || 'lat' in record) {
      return parseCoord(record.latitude ?? record.lat);
    }
  }
  return null;
}

function readLatitude(gym: any): number | null {
  return parseCoord(
    gym?.latitude ?? gym?.lat ?? gym?.location?.latitude ?? gym?.location?._lat ?? gym?.location?.lat
  );
}

function readLongitude(gym: any): number | null {
  return parseCoord(
    gym?.longitude ??
      gym?.lng ??
      gym?.lon ??
      gym?.location?.longitude ??
      gym?.location?._long ??
      gym?.location?.lng
  );
}

/**
 * One stable pin per gym.
 * iOS MapKit drops and recreates annotations when this list is reordered, which
 * hides pins and crashes during the native remove/insert. Distance sorting stays
 * on the list; the map always keeps id order.
 * Gyms that share one exact coordinate are nudged a few meters apart so each pin
 * is drawn. The list and the gym record are not modified.
 */
function prepareMapGyms(gyms: any[]): MapGym[] {
  if (!Array.isArray(gyms) || gyms.length === 0) return [];

  const seen = new Set<string>();
  const pins: MapGym[] = [];

  for (const gym of gyms) {
    const lat = readLatitude(gym);
    const lng = readLongitude(gym);
    if (lat == null || lng == null || !isValidCoordinate(lat, lng)) continue;

    const rawId = gym?.id != null ? String(gym.id).trim() : '';
    const id = rawId.length > 0 ? rawId : `${lat.toFixed(5)},${lng.toFixed(5)},${gym?.name ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    pins.push({ ...gym, id, latitude: lat, longitude: lng });
  }

  pins.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const occupancy = new Map<string, number>();
  return pins.map((gym) => {
    const bucket = `${gym.latitude.toFixed(5)}|${gym.longitude.toFixed(5)}`;
    const index = occupancy.get(bucket) ?? 0;
    occupancy.set(bucket, index + 1);
    if (index === 0) return gym;

    const angle = index * 2.399963229728653;
    const radius = 0.00015 * Math.ceil(index / 8);
    const latitude = gym.latitude + Math.cos(angle) * radius;
    const longitude =
      gym.longitude + (Math.sin(angle) * radius) / Math.max(0.2, Math.cos((gym.latitude * Math.PI) / 180));
    if (!isValidCoordinate(latitude, longitude)) return gym;
    return { ...gym, latitude, longitude };
  });
}

function pinSignature(pins: MapGym[]): string {
  return pins
    .map((gym) => `${gym.id}\t${gym.latitude}\t${gym.longitude}\t${gym.name ?? ''}\t${gym.address ?? ''}`)
    .join('\n');
}

function safeRegion(region: MapViewComponentProps['initialRegion']) {
  const latitude = parseCoord(region?.latitude);
  const longitude = parseCoord(region?.longitude);
  if (latitude == null || longitude == null || !isValidCoordinate(latitude, longitude)) {
    return {
      latitude: 31.9539,
      longitude: 35.9106,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  }
  const latitudeDelta =
    typeof region.latitudeDelta === 'number' && Number.isFinite(region.latitudeDelta) && region.latitudeDelta > 0
      ? region.latitudeDelta
      : 0.1;
  const longitudeDelta =
    typeof region.longitudeDelta === 'number' &&
    Number.isFinite(region.longitudeDelta) &&
    region.longitudeDelta > 0
      ? region.longitudeDelta
      : 0.1;
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

class MapRenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export default function MapViewComponent({ gyms, initialRegion, onMarkerPress }: MapViewComponentProps) {
  const isFocused = useIsFocused();
  const onPressRef = useRef(onMarkerPress);
  onPressRef.current = onMarkerPress;
  const regionRef = useRef(safeRegion(initialRegion));
  // iOS drops markers that are inserted before MKMapView has a real frame.
  const [mapReady, setMapReady] = useState(Platform.OS !== 'ios');

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const timer = setTimeout(() => setMapReady(true), 700);
    return () => clearTimeout(timer);
  }, []);

  const pins = prepareMapGyms(gyms);
  const signature = pinSignature(pins);

  const markers = useMemo(() => {
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
        // iOS 11 balloon markers are hidden by MapKit when they overlap, then a
        // different subset comes back on the next pan. Legacy pins stay visible.
        // Android does not use these props, so its markers stay as they are.
        {...(Platform.OS === 'ios' ? { useLegacyPinView: true, tracksViewChanges: false } : {})}
        onCalloutPress={() => onPressRef.current?.(gym)}
      />
    ));
    // Same gyms in a new array (distance sort, parent re-render) must not rebuild markers.
    // Rebuilding is what makes iOS remove pins and crash in the native map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const fallback = (
    <View style={styles.mapContainer}>
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>Map View</Text>
        <Text style={styles.fallbackText}>
          {pins.length || (Array.isArray(gyms) ? gyms.length : 0)}{' '}
          {(pins.length || (Array.isArray(gyms) ? gyms.length : 0)) === 1 ? 'gym' : 'gyms'} nearby
        </Text>
        <View style={styles.gymList}>
          {(pins.length > 0 ? pins : Array.isArray(gyms) ? gyms : []).slice(0, 3).map((gym: any, index: number) => (
            <View key={gym?.id ?? `gym-${index}`} style={styles.gymItem}>
              <Text style={styles.gymName}>{gym?.name}</Text>
              <Text style={styles.gymAddress}>{gym?.address}</Text>
            </View>
          ))}
          {(pins.length > 0 ? pins : Array.isArray(gyms) ? gyms : []).length > 3 && (
            <Text style={styles.moreText}>
              +{(pins.length > 0 ? pins : Array.isArray(gyms) ? gyms : []).length - 3} more gyms
            </Text>
          )}
        </View>
        <Text style={styles.noteText}>
          Full map view available in production build
        </Text>
      </View>
    </View>
  );

  // If maps are not available (Expo Go), show fallback
  if (!MapView || !Marker) {
    return fallback;
  }

  // Android keeps Google Maps. iOS uses Apple Maps: with the new architecture,
  // Google Maps on iOS never receives every marker, and Apple's balloon markers
  // hide whichever pins overlap until the map moves.
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE ?? undefined : undefined;

  return (
    <MapRenderBoundary fallback={fallback}>
      <View style={styles.mapContainer} collapsable={false} removeClippedSubviews={false}>
        <MapView
          provider={mapProvider}
          style={styles.map}
          initialRegion={regionRef.current}
          showsUserLocation={Platform.OS !== 'ios' || (mapReady && isFocused)}
          showsMyLocationButton
          mapType="standard"
          loadingEnabled={Platform.OS !== 'ios'}
          // Avoid Fabric reparenting crashes when the map sits inside a ScrollView.
          removeClippedSubviews={false}
          onMapReady={() => setMapReady(true)}
        >
          {mapReady ? markers : null}
        </MapView>
      </View>
    </MapRenderBoundary>
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
