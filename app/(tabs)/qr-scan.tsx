import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

export default function QRScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<boolean>(false);
  const scanLockedRef = useRef(false);
  const { checkIn } = useApp();
  const { isGuest } = useAuth();
  const { subscription } = useApp();

  useEffect(() => {
    // Unlock scanner when screen unmounts
    return () => {
      scanLockedRef.current = false;
    };
  }, []);

  if (isGuest || !subscription) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Subscription Required</Text>
          <Text style={styles.permissionText}>
            You need an active subscription to use the QR scanner and check in to gyms.
          </Text>
          <TouchableOpacity 
            style={styles.permissionButton} 
            onPress={() => router.push('/(tabs)/subscription')}
          >
            <Text style={styles.permissionButtonText}>Subscribe Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need access to your camera to scan QR codes at the gym
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ data }: { data: string }): Promise<void> => {
    // Hard lock to prevent multiple executions from rapid duplicate events
    if (scanLockedRef.current || scanned) return;

    scanLockedRef.current = true;
    setScanned(true);

    console.log('[QRScan] QR code scanned (tabs):', data);

    // Parse QR code - expected format: "xpass-gym-{gymId}" or just "{gymId}"
    let gymId = data;
    if (data.startsWith('xpass-gym-')) {
      gymId = data.replace('xpass-gym-', '');
    } else if (data.startsWith('gym-')) {
      gymId = data.replace('gym-', '');
    }

    if (!gymId || gymId.trim() === '') {
      console.error('[QRScan] Invalid QR format:', data);
      router.push({
        pathname: '/qr-error',
        params: { message: 'Invalid QR code. Please scan a valid gym QR code.' },
      } as any);
      setScanned(false);
      return;
    }

    const checkInResult = await checkIn(gymId);
    console.log('[QRScan] Check-in result:', checkInResult);

    if (checkInResult.success) {
      router.push({
        pathname: '/qr-success',
        params: { message: checkInResult.message || 'Check-in successful!' },
      } as any);
    } else {
      // Allow retry only when the operation failed
      scanLockedRef.current = false;
      setScanned(false);
      router.push({
        pathname: '/qr-error',
        params: { message: checkInResult.message || 'Check-in unsuccessful' },
      } as any);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={'back' as CameraType}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.topOverlay} />
          <View style={styles.middleRow}>
            <View style={styles.sideOverlay} />
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.sideOverlay} />
          </View>
          <View style={styles.bottomOverlay}>
            <Text style={styles.instructionText}>
              Position the QR code within the frame
            </Text>
          </View>
        </View>


      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 250,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: Colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  instructionText: {
    fontSize: 16,
    color: Colors.white,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
});
