import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';
import { agentLog } from '@/lib/agent-debug-log';

export default function QRScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanMessage, setScanMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [isResolvingSubscription, setIsResolvingSubscription] = useState<boolean>(true);
  const [subscriptionResolveError, setSubscriptionResolveError] = useState<string | null>(null);
  const scanLockedRef = useRef(false);
  const lastScanAtRef = useRef(0);
  const subscriptionResolveKeyRef = useRef<string | null>(null);
  const { checkIn, subscription, refreshSubscription } = useApp();
  const { isGuest, firebaseUser } = useAuth();
  const SUBSCRIPTION_RESOLVE_TIMEOUT_MS = 12000;

  useEffect(() => {
    // Unlock scanner when screen unmounts
    return () => {
      scanLockedRef.current = false;
    };
  }, []);

  const resolveSubscriptionStatus = useCallback(async (): Promise<void> => {
    if (isGuest) {
      setSubscriptionResolveError(null);
      setIsResolvingSubscription(false);
      return;
    }

    setIsResolvingSubscription(true);
    setSubscriptionResolveError(null);

    const withTimeout = async (promise: Promise<unknown>, timeoutMs: number): Promise<void> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Subscription check timed out.')), timeoutMs);
      });
      try {
        await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    try {
      await withTimeout(refreshSubscription(), SUBSCRIPTION_RESOLVE_TIMEOUT_MS);
    } catch (error) {
      console.warn('[QRScan] Failed to refresh subscription, retrying once...', error);
      try {
        await withTimeout(refreshSubscription(), SUBSCRIPTION_RESOLVE_TIMEOUT_MS);
      } catch (retryError) {
        console.error('[QRScan] Subscription refresh retry failed:', retryError);
        setSubscriptionResolveError(
          'Unable to verify subscription right now. Please check your connection and try again.'
        );
      }
    } finally {
      setIsResolvingSubscription(false);
    }
  }, [isGuest, refreshSubscription]);

  useEffect(() => {
    const resolveKey = `${isGuest ? 'guest' : 'member'}:${firebaseUser?.uid ?? 'none'}`;
    if (subscriptionResolveKeyRef.current === resolveKey) return;
    subscriptionResolveKeyRef.current = resolveKey;
    void resolveSubscriptionStatus();
  }, [isGuest, firebaseUser?.uid, resolveSubscriptionStatus]);

  if (isResolvingSubscription) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Checking subscription...</Text>
          <Text style={styles.permissionText}>Please wait while we validate your access.</Text>
        </View>
      </View>
    );
  }

  if (isGuest || !subscription) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Subscription Required</Text>
          <Text style={styles.permissionText}>
            {subscriptionResolveError ||
              'You need an active subscription to use the QR scanner and check in to gyms.'}
          </Text>
          {!isGuest && (
            <TouchableOpacity style={[styles.permissionButton, styles.retryButton]} onPress={() => void resolveSubscriptionStatus()}>
              <Text style={styles.permissionButtonText}>Retry Check</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => {
              if (isGuest) {
                agentLog('H5', 'qr-scan.tsx:subscribeNow', 'push_login', {});
                router.push('/login');
                return;
              }

              agentLog('H5', 'qr-scan.tsx:subscribeNow', 'push_subscription_tab', {});
              router.push('/(tabs)/subscription');
            }}
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
            <Text style={styles.permissionButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ data }: { data: string }): Promise<void> => {
    const now = Date.now();
    if (scanLockedRef.current || now - lastScanAtRef.current < 2500) return;
    lastScanAtRef.current = now;
    scanLockedRef.current = true;

    console.log('[QRScan] QR code scanned (tabs):', data);

    // Parse QR code - expected format: "xpass-gym-{gymId}" or just "{gymId}"
    let gymId = data.trim();
    const gymTagMatch = gymId.match(/(?:xpass-gym-|gym-)([a-zA-Z0-9_-]+)/);
    if (gymTagMatch?.[1]) {
      gymId = gymTagMatch[1];
    } else {
      try {
        if (gymId.startsWith('http://') || gymId.startsWith('https://')) {
          const url = new URL(gymId);
          gymId = url.searchParams.get('gymId') || url.pathname.split('/').filter(Boolean).pop() || gymId;
        }
      } catch {
        // Keep raw value as fallback.
      }
    }

    if (!gymId || gymId.trim() === '') {
      console.error('[QRScan] Invalid QR format:', data);
      setScanMessage({ success: false, text: 'Invalid QR code. Please scan a valid gym QR code.' });
      setTimeout(() => setScanMessage(null), 2500);
      scanLockedRef.current = false;
      return;
    }

    const checkInResult = await checkIn(gymId);
    console.log('[QRScan] Check-in result:', checkInResult);
    setScanMessage({
      success: checkInResult.success,
      text: checkInResult.message || (checkInResult.success ? 'Check-in successful!' : 'Check-in unsuccessful'),
    });
    setTimeout(() => setScanMessage(null), 2500);
    scanLockedRef.current = false;
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={'back' as CameraType}
        onBarcodeScanned={handleBarCodeScanned}
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
        {scanMessage && (
          <View style={styles.resultBanner}>
            <Text style={[styles.resultBannerText, scanMessage.success ? styles.successText : styles.errorText]}>
              {scanMessage.text}
            </Text>
          </View>
        )}


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
  resultBanner: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  resultBannerText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  successText: {
    color: '#4ADE80',
  },
  errorText: {
    color: '#FCA5A5',
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
  retryButton: {
    marginBottom: 10,
    backgroundColor: Colors.textSecondary,
  },
});
