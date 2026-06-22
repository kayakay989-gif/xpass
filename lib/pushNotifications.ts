import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Minimal, additive push-notification helper for the native (iOS/Android) apps.
 *
 * Web is intentionally a no-op: expo-notifications has no push support on web and
 * we must not regress the existing web build. All native modules are loaded lazily
 * via require() inside platform guards so web bundling never pulls them in.
 */

function isNative(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNotifications(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDevice(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-device');
}

let handlerConfigured = false;

/** Show alerts/banners while the app is foregrounded. Safe to call multiple times. */
export function configurePushNotifications(): void {
  if (!isNative() || handlerConfigured) return;
  try {
    const Notifications = getNotifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  } catch (e) {
    console.warn('[Push] Failed to configure notification handler', e);
  }
}

function resolveProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId;
  const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
    ?.projectId;
  return fromExtra || fromEasConfig;
}

/**
 * Requests permission (if needed) and returns the Expo push token, or null if
 * unavailable (web, simulator, denied permission, or misconfiguration).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!isNative()) return null;

  try {
    const Notifications = getNotifications();
    const Device = getDevice();

    if (!Device.isDevice) {
      // Push tokens are not available on simulators/emulators.
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#DC143C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId = resolveProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return typeof tokenResponse?.data === 'string' ? tokenResponse.data : null;
  } catch (e) {
    console.warn('[Push] Failed to register for push notifications', e);
    return null;
  }
}
