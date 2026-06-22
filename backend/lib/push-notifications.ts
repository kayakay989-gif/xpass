import { adminDb } from '@/backend/lib/firebase-admin';
import { Subscription } from '@/types';

/**
 * Minimal, additive server-side push delivery via the Expo Push API.
 * Reads the recipient's Expo token + notification preferences directly from the
 * user document (so the typed user mapper stays untouched) and is fully
 * best-effort: failures are logged and never throw into the calling flow.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const JORDAN_TZ = 'Asia/Amman';

type NotificationCategory = 'subscriptionUpdates' | 'checkInReminders' | 'promotionalOffers';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  );
}

/**
 * Sends a single push to a user if they have a valid token and haven't disabled
 * the relevant notification category. Returns true only when Expo accepted it.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts?: { category?: NotificationCategory }
): Promise<boolean> {
  try {
    if (!userId) return false;
    const snap = await adminDb.collection('users').doc(userId).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};

    const token = data.expoPushToken;
    if (!isExpoPushToken(token)) return false;

    const prefs = (data.notificationPreferences as Record<string, unknown>) || {};
    // Master push toggle and per-category toggle default to ON when unset.
    if (prefs.push === false) return false;
    if (opts?.category && prefs[opts.category] === false) return false;

    const message = {
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      channelId: 'default',
    };

    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Push] Expo push send failed', res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Push] sendPushToUser error', e);
    return false;
  }
}

function formatDateAmman(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JORDAN_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

/** Push confirming a newly activated subscription. Best-effort. */
export async function notifySubscriptionActivated(
  userId: string,
  subscription: Subscription
): Promise<void> {
  const tier = subscription.tier
    ? subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)
    : 'Membership';
  await sendPushToUser(
    userId,
    {
      title: 'Subscription active',
      body: `Your ${tier} plan is now active. Enjoy your access!`,
      data: { type: 'subscription_activated', subscriptionId: subscription.id },
    },
    { category: 'subscriptionUpdates' }
  );
}

/** Push reminding the user their plan (and remaining passes) expire soon. Best-effort. */
export async function notifySubscriptionExpiringSoon(
  userId: string,
  subscription: Subscription
): Promise<void> {
  const endDate =
    subscription.endDate instanceof Date ? subscription.endDate : new Date(subscription.endDate);
  const remainingPasses = Math.max(
    0,
    (subscription.maxVisitsPerMonth ?? 0) - (subscription.visitsUsed ?? 0)
  );
  const passText =
    remainingPasses > 0
      ? ` Your ${remainingPasses} remaining pass${remainingPasses === 1 ? '' : 'es'} will expire too.`
      : '';
  await sendPushToUser(
    userId,
    {
      title: 'Your plan expires in 3 days',
      body: `Renew before ${formatDateAmman(endDate)} to keep uninterrupted gym access.${passText}`,
      data: { type: 'subscription_expiring', subscriptionId: subscription.id },
    },
    { category: 'subscriptionUpdates' }
  );
}
