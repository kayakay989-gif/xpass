/** Map Firebase / RN Firebase errors to short UI messages. */
export function mapPhoneAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code || '')
      : '';
  const msg =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: string }).message || '')
      : err instanceof Error
        ? err.message
        : '';

  if (code === 'auth/invalid-phone-number' || msg.includes('invalid-phone-number')) {
    return 'That phone number looks invalid. Check the country code and digits.';
  }
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (code === 'auth/quota-exceeded') {
    return 'SMS quota exceeded. Try again later or contact support.';
  }
  if (code === 'auth/session-expired' || code === 'auth/code-expired') {
    return 'This code expired. Request a new one.';
  }
  if (code === 'auth/invalid-verification-code' || code === 'auth/invalid-verification-id') {
    return 'Invalid code. Check the SMS and try again.';
  }
  if (code === 'auth/network-request-failed' || msg.toLowerCase().includes('network')) {
    return 'Network error. Check your connection and try again.';
  }
  if (msg === 'PHONE_AUTH_REQUIRES_APP') {
    return 'Phone sign-in is only available in the mobile app.';
  }
  if (msg === 'PHONE_VERIFICATION_START_FAILED') {
    return 'Could not send SMS. Try again.';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'This phone number is already linked to another account.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'For security, please log out and log in again, then verify your phone.';
  }
  if (msg === 'NOT_LOGGED_IN') {
    return 'Please log in again.';
  }
  return msg || 'Something went wrong. Please try again.';
}
