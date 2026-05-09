import { protectedProcedure } from '@/backend/trpc/create-context';
import { adminDb } from '@/backend/lib/firebase-admin';

const REFERRAL_REWARD_JOD = 10;

export default protectedProcedure.query(async ({ ctx }) => {
  const uid = ctx.user?.uid;
  if (!uid) {
    throw new Error('Unauthorized');
  }

  const userSnap = await adminDb.collection('users').doc(uid).get();

  const referralCode =
    typeof userSnap.data()?.referralCode === 'string'
      ? String(userSnap.data()?.referralCode).trim().toUpperCase()
      : '';

  const referralCodeVariants = referralCode
    ? Array.from(new Set([referralCode, referralCode.toLowerCase(), referralCode.toUpperCase()]))
    : [];

  // Keep queries index-safe (single where-clause each) and tolerate partial query failures.
  const settled = await Promise.allSettled([
    adminDb.collection('referralTransactions').where('referrerId', '==', uid).get(),
    ...referralCodeVariants.map((code) =>
      adminDb.collection('referralTransactions').where('referrerCode', '==', code).get()
    ),
    // Query by userId only, then filter referral type in memory (avoids composite index requirement).
    adminDb.collection('walletTransactions').where('userId', '==', uid).get(),
    ...(referralCode ? [adminDb.collection('users').where('referredBy', '==', referralCode).get()] : []),
    // Legacy fallback where referredBy may store the referrer's UID.
    adminDb.collection('users').where('referredBy', '==', uid).get(),
  ]);

  const successfulSnaps = settled
    .filter((result): result is PromiseFulfilledResult<FirebaseFirestore.QuerySnapshot> => result.status === 'fulfilled')
    .map((result) => result.value);

  const referralTxDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const walletDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const referredUserDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  successfulSnaps.forEach((snap) => {
    const first = snap.docs[0]?.data() as any;
    if (first && ('rewardAmount' in first || 'referrerId' in first || 'referrerCode' in first || 'referredUserId' in first)) {
      referralTxDocs.push(...snap.docs);
      return;
    }
    if (first && ('type' in first || 'userId' in first || 'amount' in first)) {
      walletDocs.push(...snap.docs);
      return;
    }
    if (first && ('referredBy' in first || 'referralCode' in first || 'email' in first)) {
      referredUserDocs.push(...snap.docs);
    }
  });

  const rewardedByUserId = new Map<string, number>();

  referralTxDocs.forEach((d) => {
    const data = d.data() as any;
    const referredUserId =
      typeof data?.referredUserId === 'string' ? String(data.referredUserId).trim() : d.id;
    const amount = Number(data?.rewardAmount);
    rewardedByUserId.set(
      referredUserId || d.id,
      Number.isFinite(amount) ? amount : REFERRAL_REWARD_JOD
    );
  });

  walletDocs.forEach((d) => {
    const data = d.data() as any;
    const txnType = typeof data?.type === 'string' ? String(data.type).trim() : '';
    if (txnType !== 'referral_reward') return;
    const referredUserId =
      typeof data?.relatedUserId === 'string' ? String(data.relatedUserId).trim() : d.id;
    const amount = Number(data?.amount);
    rewardedByUserId.set(
      referredUserId || d.id,
      Number.isFinite(amount) ? amount : REFERRAL_REWARD_JOD
    );
  });

  const referredUsers = new Set<string>();
  referredUserDocs.forEach((d) => referredUsers.add(d.id));

  const referralCount = referredUsers.size;
  const earnedCredit = Array.from(rewardedByUserId.values()).reduce((sum, amount) => sum + amount, 0);

  return {
    referralCount,
    earnedCredit,
  };
});

