import { PhoneAuthProvider, updatePhoneNumber } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/** After SMS was requested via `nativeRequestPhoneVerificationId`, apply the code to the signed-in user. */
export async function applySmsCodeToLinkedPhone(
  verificationId: string,
  smsCode: string
): Promise<void> {
  const cred = PhoneAuthProvider.credential(verificationId, smsCode.trim());
  const user = auth.currentUser;
  if (!user) {
    throw new Error('NOT_LOGGED_IN');
  }
  await updatePhoneNumber(user, cred);
}
