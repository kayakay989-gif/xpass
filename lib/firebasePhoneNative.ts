import { Platform } from 'react-native';

const PHONE_LISTENER_TIMEOUT_MS = 120_000;

/** Throws if not iOS/Android — RN Firebase is native-only in this project. */
export function assertNativePhoneAuth(): void {
  if (Platform.OS === 'web') {
    throw new Error('PHONE_AUTH_REQUIRES_APP');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNativeFirebaseAuth(): any {
  assertNativePhoneAuth();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-firebase/auth').default;
}

/** Login / signup: returns ConfirmationResult with `.confirm(code)`. */
export async function nativeSignInWithPhoneNumber(phoneE164: string, forceResend?: boolean) {
  const authFn = getNativeFirebaseAuth();
  return authFn().signInWithPhoneNumber(phoneE164, forceResend ?? false);
}

/**
 * Link / update phone on an existing Firebase JS user: obtain verificationId via RN listener,
 * then use PhoneAuthProvider.credential + updatePhoneNumber or linkWithCredential on web SDK.
 *
 * **Android:** Do NOT `await listener` alone. RN Firebase resolves that promise only after
 * SMS auto-retrieval times out (or instant-verify), not when the SMS is sent — so the UI would
 * spin for ~60s or appear stuck. We subscribe to `state_changed` and resolve on `sent`.
 *
 * @see https://github.com/invertase/react-native-firebase/blob/main/packages/auth/lib/PhoneAuthListener.js
 */
/** Second arg `true` forces a new SMS when Firebase supports it (same as linking UI “Resend”). */
export async function nativeRequestPhoneVerificationId(
  phoneE164: string,
  forceResend = false
): Promise<string> {
  const authFn = getNativeFirebaseAuth();
  const listener = authFn().verifyPhoneNumber(phoneE164, forceResend);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      action();
    };

    const timeoutId = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'PHONE_VERIFICATION_START_FAILED: timed out waiting for SMS session. Check network and Firebase Android SHA fingerprints.'
          )
        )
      );
    }, PHONE_LISTENER_TIMEOUT_MS);

    listener.on(
      'state_changed',
      (snapshot: {
        verificationId?: string;
        state?: string;
        error?: Error & { code?: string };
      }) => {
        if (snapshot?.state === 'error' || snapshot?.error) {
          finish(() => reject(snapshot.error ?? new Error('Phone verification failed')));
          return;
        }
        const vid = snapshot?.verificationId;
        const state = snapshot?.state;
        if (!vid) return;

        if (state === 'sent' || state === 'timeout' || state === 'verified') {
          finish(() => resolve(vid));
        }
      },
      (err: unknown) => finish(() => reject(err))
    );

    listener.catch((err: unknown) => finish(() => reject(err)));
  });
}

export async function nativeSignOut(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const authFn = getNativeFirebaseAuth();
    await authFn().signOut();
  } catch {
    // Ignore — module may be unavailable in odd environments.
  }
}
