import { protectedProcedure } from '@/backend/trpc/create-context';
import { adminDb } from '@/backend/lib/firebase-admin';
import admin from '@/backend/lib/firebase-admin';
import { firestoreUsers } from '@/backend/lib/firestore-admin';
import { sendWelcomeEmail } from '@/backend/lib/welcome-email';

/**
 * Idempotent welcome email after account creation. Client may call on new sign-up;
 * server records `welcomeEmailSentAt` on the user doc.
 */
export default protectedProcedure.mutation(async ({ ctx }) => {
  const uid = ctx.user?.uid;
  if (!uid) {
    throw new Error('Unauthorized');
  }

  const ref = adminDb.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return { sent: false as const, reason: 'no_profile' as const };
  }

  const data = snap.data() || {};
  if (data.welcomeEmailSentAt) {
    return { sent: false as const, reason: 'already_sent' as const };
  }

  const user = await firestoreUsers.getById(uid);
  const email = user?.email?.trim();
  if (!email) {
    return { sent: false as const, reason: 'no_email' as const };
  }

  await sendWelcomeEmail({ toEmail: email, userName: user?.name });
  await ref.update({
    welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { sent: true as const };
});
