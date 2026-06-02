import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { X, CheckCircle, XCircle } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';
import { getCheckInUserMessage } from '@/lib/check-in-errors';
import { isSubscriptionActiveForMember } from '@/lib/subscription-active';

export default function QRScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockedRef = useRef(false);
  const lastScanAtRef = useRef(0);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isResolvingSubscription, setIsResolvingSubscription] = useState<boolean>(true);
  const [subscriptionResolveError, setSubscriptionResolveError] = useState<string | null>(null);
  const subscriptionResolveKeyRef = useRef<string | null>(null);
  const timerIdsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const { checkIn, subscription, refreshSubscription } = useApp();
  const { isGuest, firebaseUser } = useAuth();
  const SUBSCRIPTION_RESOLVE_TIMEOUT_MS = 12000;

  const clearScanTimersAndResult = useCallback(() => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];
    setResult(null);
    scanLockedRef.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        clearScanTimersAndResult();
      };
    }, [clearScanTimersAndResult])
  );

  useEffect(() => {
    return () => {
      clearScanTimersAndResult();
    };
  }, [clearScanTimersAndResult]);

  const safeSetTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timerIdsRef.current = timerIdsRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timerIdsRef.current.push(id);
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
      console.warn('[QRScanner] Failed to refresh subscription, retrying once...', error);
      try {
        await withTimeout(refreshSubscription(), SUBSCRIPTION_RESOLVE_TIMEOUT_MS);
      } catch (retryError) {
        console.error('[QRScanner] Subscription refresh retry failed:', retryError);
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

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios' || isGuest) return;
      void refreshSubscription().catch((err) => {
        console.warn('[QRScanner] iOS focus subscription refresh failed:', err);
      });
    }, [isGuest, refreshSubscription])
  );

  const hasQrAccess =
    Platform.OS === 'ios'
      ? isSubscriptionActiveForMember(subscription)
      : !!subscription;

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

  if (isGuest || !hasQrAccess) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Subscription Required</Text>
          <Text style={styles.permissionText}>
            {subscriptionResolveError ||
              'You need an active subscription to use the QR scanner and check in to gyms.'}
          </Text>
          {!isGuest && (
            <TouchableOpacity
              style={[styles.permissionButton, styles.retryButton]}
              onPress={() => void resolveSubscriptionStatus()}
            >
              <Text style={styles.permissionButtonText}>Retry Check</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => {
              if (isGuest) {
                router.push('/login');
                return;
              }
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
    if (!isFocusedRef.current) return;
    // Prevent multiple executions from rapid duplicate events
    const now = Date.now();
    if (scanLockedRef.current || now - lastScanAtRef.current < 2500) return;
    
    lastScanAtRef.current = now;
    scanLockedRef.current = true;
    
    console.log('[QRScanner] QR code scanned:', data);
    
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
        // keep raw
      }
    }
    
    // Validate gymId is not empty
    if (!gymId || gymId.trim() === '') {
      console.error('[QRScanner] Invalid QR code format:', data);
      setResult({ 
        success: false, 
        message: 'Invalid QR code. Please scan a valid gym QR code.' 
      });
      safeSetTimeout(() => {
        setResult(null);
        scanLockedRef.current = false;
      }, 3000);
      return;
    }
    
    console.log('[QRScanner] Extracted gymId:', gymId);
    
    try {
      const checkInResult = await checkIn(gymId);
      if (!isFocusedRef.current) {
        scanLockedRef.current = false;
        return;
      }

      console.log('[QRScanner] Check-in result:', checkInResult);
      
      setResult(checkInResult);
      
      safeSetTimeout(() => {
        if (checkInResult.success) {
          scanLockedRef.current = false;
          setResult(null);
          if (isFocusedRef.current) {
            router.replace('/(tabs)/home');
          }
        } else {
          scanLockedRef.current = false;
          setResult(null);
        }
      }, 2000);
    } catch (error: any) {
      console.error('[QRScanner] Check-in error:', error);
      if (!isFocusedRef.current) {
        scanLockedRef.current = false;
        return;
      }
      setResult({ 
        success: false, 
        message: getCheckInUserMessage(error),
      });
      safeSetTimeout(() => {
        scanLockedRef.current = false;
        setResult(null);
      }, 2000);
    }
  };

  return (
    <View style={styles.container}>
      {isFocused ? (
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

        {result && isFocused && (
          <View style={styles.resultOverlay}>
            <View style={[
              styles.resultCard,
              result.success ? styles.successCard : styles.errorCard
            ]}>
              {result.success ? (
                <CheckCircle size={48} color={Colors.success} />
              ) : (
                <XCircle size={48} color={Colors.error} />
              )}
              <Text style={styles.resultText}>{result.message}</Text>
            </View>
          </View>
        )}
      </CameraView>
      ) : (
        <View style={[styles.camera, styles.cameraInactive]} />
      )}

      <TouchableOpacity 
        style={styles.closeButton}
        onPress={() => router.back()}
      >
        <X size={24} color={Colors.text} />
      </TouchableOpacity>
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
  cameraInactive: {
    backgroundColor: Colors.background,
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
    color: Colors.text,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
    color: Colors.text,
  },
  retryButton: {
    marginBottom: 10,
    backgroundColor: Colors.textSecondary,
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 40,
  },
  successCard: {
    borderWidth: 2,
    borderColor: Colors.success,
  },
  errorCard: {
    borderWidth: 2,
    borderColor: Colors.error,
  },
  resultText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
});
