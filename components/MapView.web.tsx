import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import { GOOGLE_MAPS_API_KEY } from '@/lib/google-maps-config';

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

// Web-only component to render the Google Maps div using React.createElement
// This works with React Native Web which renders divs properly
function GoogleMapDiv({ mapRef }: { mapRef: React.RefObject<HTMLDivElement> }) {
  // @ts-ignore - React Native Web supports HTML elements
  return React.createElement('div', {
    ref: mapRef,
    style: {
      width: '100%',
      height: '100%',
      borderRadius: 16,
    },
  });
}

export default function MapViewComponent({ gyms, initialRegion, onMarkerPress }: MapViewComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const hasValidKey = !!GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'REPLACE_ME';

  const loadGoogleMaps = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if ((window as any).google?.maps) return;

    const w = window as any;
    if (w.__xpassGoogleMapsLoadingPromise) {
      await w.__xpassGoogleMapsLoadingPromise;
      return;
    }

    w.__xpassGoogleMapsLoadingPromise = new Promise<void>((resolve, reject) => {
      // If a script exists (e.g. navigating between screens), wait for it to finish loading.
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-xpass-google-maps="1"]'
      );

      const onLoaded = () => {
        if ((window as any).google?.maps) resolve();
        else reject(new Error('Google Maps script loaded but window.google.maps is missing'));
      };

      if (existing) {
        // If it already loaded, resolve immediately. Otherwise, attach handlers.
        if ((window as any).google?.maps) {
          resolve();
        } else {
          existing.addEventListener('load', onLoaded, { once: true });
          existing.addEventListener(
            'error',
            () => reject(new Error('Failed to load Google Maps script')),
            { once: true }
          );
        }
        return;
      }

      const script = document.createElement('script');
      script.setAttribute('data-xpass-google-maps', '1');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = onLoaded;
      script.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(script);
    })
      .finally(() => {
        // Keep the resolved promise around; do not delete. This prevents racing reloads on slow mobile.
      });

    await w.__xpassGoogleMapsLoadingPromise;
  };

  useEffect(() => {
    if (!hasValidKey) {
      setGoogleMapsError('Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild the web bundle.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (!cancelled) setGoogleMapsLoaded(true);
      } catch (e) {
        console.error('[MapView.web] Failed to load Google Maps:', e);
        if (!cancelled) {
          setGoogleMapsError(
            'Failed to load Google Maps. Check API key validity / referrer restrictions.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasValidKey]);

  useEffect(() => {
    if (googleMapsLoaded && mapRef.current && !mapInstanceRef.current && typeof window !== 'undefined') {
      const google = (window as any).google;
      if (!google?.maps) return;

      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center: {
          lat: initialRegion.latitude,
          lng: initialRegion.longitude,
        },
        zoom: 13,
        mapTypeId: 'roadmap',
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      infoWindowRef.current = new google.maps.InfoWindow();
    }
  }, [googleMapsLoaded, initialRegion.latitude, initialRegion.longitude]);

  // Sync markers whenever gyms change (e.g., filters change or data loads from Firestore)
  useEffect(() => {
    if (!googleMapsLoaded || typeof window === 'undefined') return;
    const google = (window as any).google;
    const map = mapInstanceRef.current;
    if (!google?.maps || !map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const validGyms = (gyms || [])
      .map((g) => ({
        ...g,
        latitude: typeof g.latitude === 'string' ? parseFloat(g.latitude) : g.latitude,
        longitude: typeof g.longitude === 'string' ? parseFloat(g.longitude) : g.longitude,
      }))
      .filter((g) => Number.isFinite(g.latitude) && Number.isFinite(g.longitude));

    validGyms.forEach((gym) => {
      const marker = new google.maps.Marker({
        position: { lat: gym.latitude, lng: gym.longitude },
        map,
        title: gym.name,
        animation: google.maps.Animation.DROP,
      });

      marker.addListener('click', () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(`
            <div style="padding: 8px; max-width: 220px;">
              <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px;">${gym.name}</div>
              <div style="font-size: 12px; color: #666;">${gym.address || ''}</div>
              <div style="font-size: 11px; color: #999; margin-top: 6px;">Tap again to open</div>
            </div>
          `);
          infoWindowRef.current.open(map, marker);
        }
        onMarkerPress?.(gym);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds if we have gyms
    if (validGyms.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      validGyms.forEach((g) => bounds.extend({ lat: g.latitude, lng: g.longitude }));
      map.fitBounds(bounds);
    }
  }, [googleMapsLoaded, gyms, onMarkerPress]);

  if (googleMapsError) {
    return (
      <View style={styles.mapContainer}>
        <View style={styles.webMapPlaceholder}>
          <Text style={styles.webMapText}>Map unavailable</Text>
          <Text style={styles.webMapSubtext}>{googleMapsError}</Text>
          <Text style={styles.webMapSubtext}>{gyms.length} gyms found</Text>
        </View>
      </View>
    );
  }

  if (!googleMapsLoaded) {
    return (
      <View style={styles.mapContainer}>
        <View style={styles.webMapPlaceholder}>
          <Text style={styles.webMapText}>Loading map...</Text>
          <Text style={styles.webMapSubtext}>{gyms.length} gyms found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <GoogleMapDiv mapRef={mapRef} />
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
  webMapPlaceholder: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webMapText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  webMapSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
