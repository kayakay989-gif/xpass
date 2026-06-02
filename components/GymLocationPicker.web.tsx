import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@/lib/google-maps-config';
import { Search, MapPin, X } from 'lucide-react-native';

type Props = {
  coordinate: { latitude: number; longitude: number };
  onChange: (coord: { latitude: number; longitude: number }) => void;
  onSelectPlace?: (place: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
};

/** Google Places types for fitness / sports businesses (plus unrestricted search). */
const FITNESS_PLACE_TYPES = ['gym', 'stadium', 'spa'] as const;

function dedupePlacesById(places: any[]): any[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    const id = place?.place_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Web-only component to render the Google Maps div
function GoogleMapDiv({ mapRef }: { mapRef: React.RefObject<HTMLDivElement> }) {
  // @ts-ignore - React Native Web supports HTML elements
  return React.createElement('div', {
    ref: mapRef,
    style: {
      width: '100%',
      height: '100%',
      minHeight: 400,
    },
  });
}

export default function GymLocationPicker({ coordinate, onChange, onSelectPlace }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<any>(null);
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
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-xpass-google-maps="1"]'
      );

      const onLoaded = () => {
        if ((window as any).google?.maps) resolve();
        else reject(new Error('Google Maps script loaded but window.google.maps is missing'));
      };

      if (existing) {
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
    });

    await w.__xpassGoogleMapsLoadingPromise;
  };

  // Get user's current location
  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          // Fallback to default location (Amman, Jordan)
          resolve({
            latitude: 31.963158,
            longitude: 35.930359,
          });
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    });
  };

  // Load Google Maps script
  useEffect(() => {
    if (!hasValidKey) {
      setGoogleMapsError('Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild the web bundle.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (!cancelled) {
          setGoogleMapsLoaded(true);
        }
      } catch (e) {
        console.error('[GymLocationPicker] Failed to load Google Maps:', e);
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

  // Initialize map after Google Maps is loaded
  useEffect(() => {
    if (!googleMapsLoaded || !mapRef.current || typeof window === 'undefined') return;
    
    const google = (window as any).google;
    if (!google?.maps) return;

    let cancelled = false;

    (async () => {
      try {
        // Get current location
        const currentLocation = await getCurrentLocation();
        if (cancelled) return;

        // Wait a bit to ensure the div is fully rendered and has dimensions
        await new Promise(resolve => setTimeout(resolve, 200));
        if (cancelled || !mapRef.current) return;

        // Ensure the map div has dimensions
        const mapDiv = mapRef.current;
        if (mapDiv.offsetWidth === 0 || mapDiv.offsetHeight === 0) {
          console.warn('[GymLocationPicker] Map div has no dimensions, retrying...');
          await new Promise(resolve => setTimeout(resolve, 300));
          if (cancelled || !mapRef.current) return;
        }

        // Initialize map with current location
        const map = new google.maps.Map(mapRef.current, {
          center: {
            lat: currentLocation.latitude,
            lng: currentLocation.longitude,
          },
          zoom: 15,
          mapTypeId: 'roadmap',
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        if (cancelled) return;

        mapInstanceRef.current = map;

        // Create marker
        const marker = new google.maps.Marker({
          position: { lat: currentLocation.latitude, lng: currentLocation.longitude },
          map,
          draggable: true,
          title: 'Selected Location',
        });

        markerRef.current = marker;

        // Update coordinate when marker is dragged
        marker.addListener('dragend', (event: any) => {
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          onChange({ latitude: lat, longitude: lng });
          setSelectedPlace(null);
        });

        // Update marker when map is clicked
        map.addListener('click', (event: any) => {
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          marker.setPosition({ lat, lng });
          onChange({ latitude: lat, longitude: lng });
          setSelectedPlace(null);
        });

        // Initialize Places service
        placesServiceRef.current = new google.maps.places.PlacesService(map);

        // Initialize Autocomplete for search
        if (searchInputRef.current) {
          const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
            // All Google Business / POI establishments (gyms, sports clubs, fitness centers, etc.)
            types: ['establishment'],
            fields: ['place_id', 'geometry', 'name', 'formatted_address', 'address_components'],
          });

          autocompleteRef.current = autocomplete;

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              
              marker.setPosition({ lat, lng });
              map.setCenter({ lat, lng });
              map.setZoom(16);
              
              onChange({ latitude: lat, longitude: lng });
              
              const address = place.formatted_address || '';
              const name = place.name || '';
              
              setSelectedPlace({ name, address, latitude: lat, longitude: lng });
              setSearchQuery(name || address);
              
              if (onSelectPlace) {
                onSelectPlace({ name, address, latitude: lat, longitude: lng });
              }
            }
          });
        }
      } catch (e) {
        console.error('[GymLocationPicker] Failed to initialize map:', e);
        if (!cancelled) {
          setGoogleMapsError('Failed to initialize map. Please try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleMapsLoaded, onChange, onSelectPlace]);

  // Search businesses via Places API (gyms, sports clubs, fitness centers, etc.)
  const searchPlaces = async (query: string) => {
    if (!query.trim() || !placesServiceRef.current || !mapInstanceRef.current) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const map = mapInstanceRef.current;
    const google = (window as any).google;
    if (!google?.maps?.places) {
      setIsSearching(false);
      return;
    }

    const trimmed = query.trim();
    const center = map.getCenter();
    const baseRequest = {
      query: trimmed,
      location: center,
      radius: 15000,
    };

    const runTextSearch = (request: Record<string, unknown>): Promise<any[]> =>
      new Promise((resolve) => {
        placesServiceRef.current.textSearch(request, (results: any[], status: string) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve(results);
          } else {
            resolve([]);
          }
        });
      });

    try {
      const requests: Record<string, unknown>[] = [
        { ...baseRequest },
        ...FITNESS_PLACE_TYPES.map((type) => ({ ...baseRequest, type })),
      ];
      const batches = await Promise.all(requests.map(runTextSearch));
      const merged = dedupePlacesById(batches.flat());
      setSearchResults(merged.slice(0, 12));
    } catch (e) {
      console.warn('[GymLocationPicker] Place search failed:', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 2) {
      searchPlaces(text);
    } else {
      setSearchResults([]);
    }
  };

  const selectGymFromResults = (place: any) => {
    const map = mapInstanceRef.current;
    const google = (window as any).google;
    if (!google?.maps || !map || !markerRef.current) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    markerRef.current.setPosition({ lat, lng });
    map.setCenter({ lat, lng });
    map.setZoom(16);

    onChange({ latitude: lat, longitude: lng });

    const address = place.formatted_address || '';
    const name = place.name || '';

    setSelectedPlace({ name, address, latitude: lat, longitude: lng });
    setSearchQuery(name || address);
    setSearchResults([]);

    if (onSelectPlace) {
      onSelectPlace({ name, address, latitude: lat, longitude: lng });
    }
  };

  // Update marker position when coordinate prop changes
  useEffect(() => {
    if (markerRef.current && mapInstanceRef.current) {
      const lat = coordinate.latitude;
      const lng = coordinate.longitude;
      markerRef.current.setPosition({ lat, lng });
      mapInstanceRef.current.setCenter({ lat, lng });
    }
  }, [coordinate.latitude, coordinate.longitude]);

  if (googleMapsError) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Map unavailable</Text>
          <Text style={styles.errorText}>{googleMapsError}</Text>
        </View>
      </View>
    );
  }

  if (!googleMapsLoaded) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#E31E24" />
          <Text style={styles.overlayText}>Loading Google Maps...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={20} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          // @ts-ignore
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search gyms, fitness centers, sports clubs..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholderTextColor="#9CA3AF"
        />
        {isSearching && (
          <ActivityIndicator size="small" color="#E31E24" style={styles.searchLoader} />
        )}
      </View>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <View style={styles.resultsContainer}>
          <ScrollView style={styles.resultsList} nestedScrollEnabled>
            {searchResults.map((place, index) => (
              <TouchableOpacity
                key={place.place_id || index}
                style={styles.resultItem}
                onPress={() => selectGymFromResults(place)}
              >
                <MapPin size={16} color="#E31E24" />
                <View style={styles.resultText}>
                  <Text style={styles.resultName}>{place.name}</Text>
                  <Text style={styles.resultAddress} numberOfLines={1}>
                    {place.formatted_address}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Selected Place Info */}
      {selectedPlace && (
        <View style={styles.selectedPlaceContainer}>
          <View style={styles.selectedPlaceContent}>
            <MapPin size={16} color="#10B981" />
            <View style={styles.selectedPlaceText}>
              <Text style={styles.selectedPlaceName}>{selectedPlace.name}</Text>
              <Text style={styles.selectedPlaceAddress} numberOfLines={1}>
                {selectedPlace.address}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              setSelectedPlace(null);
              setSearchQuery('');
            }}
          >
            <X size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

      {/* Map */}
      <View style={styles.mapContainer}>
        <GoogleMapDiv mapRef={mapRef} />
      </View>
      
      <View style={styles.mapHint}>
        <Text style={styles.mapHintText}>
          Drag the marker or click on the map to set location
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    position: 'relative',
  },
  mapContainer: {
    height: 400,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    position: 'relative',
    zIndex: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  searchLoader: {
    marginLeft: 8,
  },
  resultsContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 200,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  resultsList: {
    maxHeight: 200,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  resultText: {
    flex: 1,
    marginLeft: 10,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  resultAddress: {
    fontSize: 12,
    color: '#6B7280',
  },
  selectedPlaceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: 12,
    marginBottom: 12,
  },
  selectedPlaceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedPlaceText: {
    flex: 1,
    marginLeft: 10,
  },
  selectedPlaceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  selectedPlaceAddress: {
    fontSize: 12,
    color: '#6B7280',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  overlayText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  mapHint: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  mapHintText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});
