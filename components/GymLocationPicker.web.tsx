import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import L from 'leaflet';

// Dynamically load Leaflet CSS for Expo web compatibility
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const linkId = 'leaflet-css';
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
}

type Props = {
  coordinate: { latitude: number; longitude: number };
  onChange: (coord: { latitude: number; longitude: number }) => void;
};

// Fix default marker icon paths for Leaflet when bundled
const defaultIcon = L.icon({
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function GymLocationPicker({ coordinate, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current).setView(
      [coordinate.latitude, coordinate.longitude],
      13
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker(
      [coordinate.latitude, coordinate.longitude],
      { draggable: true, icon: defaultIcon }
    ).addTo(map);

    marker.on('dragend', (event) => {
      const { lat, lng } = event.target.getLatLng();
      onChange({ latitude: lat, longitude: lng });
    });

    map.on('click', (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      marker.setLatLng([lat, lng]);
      onChange({ latitude: lat, longitude: lng });
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([coordinate.latitude, coordinate.longitude]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([coordinate.latitude, coordinate.longitude]);
    }
  }, [coordinate]);

  return (
    <View style={styles.wrapper}>
      {
        // @ts-ignore: Leaflet works with regular divs on web
        React.createElement('div', { ref: mapRef, style: styles.mapDiv })
      }
      {!mapInstanceRef.current && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Loading map...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 400,
    width: '100%',
    position: 'relative',
  },
  mapDiv: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

