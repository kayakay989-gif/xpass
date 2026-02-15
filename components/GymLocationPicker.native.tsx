import React from 'react';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import { StyleSheet } from 'react-native';

type Props = {
  coordinate: { latitude: number; longitude: number };
  onChange: (coord: { latitude: number; longitude: number }) => void;
};

export default function GymLocationPicker({ coordinate, onChange }: Props) {
  const initialRegion = {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };

  const handlePress = (event: MapPressEvent) => {
    onChange(event.nativeEvent.coordinate);
  };

  return (
    <MapView style={styles.map} initialRegion={initialRegion} onPress={handlePress}>
      <Marker
        coordinate={coordinate}
        draggable
        onDragEnd={(event) => onChange(event.nativeEvent.coordinate)}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});

