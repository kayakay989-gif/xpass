import { z } from 'zod';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { adminDb } from '@/backend/lib/firebase-admin';
import admin from '@/backend/lib/firebase-admin';

/**
 * Persists `referredBy` = the referrer's public `referralCode` string (must match `users/{referrer}.referralCode`).
 * `referrals.ts` resolves the referrer from this value at payment time.
 */
export default protectedProcedure
  .input(z.object({ code: z.string().min(3).max(40) }))
  .mutation(async ({ input, ctx }) => {
    const uid = ctx.user?.uid;
    if (!uid) {
      throw new Error('Unauthorized');
    }

    const trimmed = input.code.trim();
    const normalized = trimmed.toUpperCase();
    if (!normalized) {
      return { ok: false as const, reason: 'invalid_code' as const };
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { ok: false as const, reason: 'no_profile' as const };
    }

    const existingBy =
      typeof userSnap.data()?.referredBy === 'string'
        ? String(userSnap.data()?.referredBy).trim()
        : '';
    if (existingBy) {
      return { ok: true as const, alreadyLinked: true as const };
    }

    const variants = Array.from(
      new Set([normalized, trimmed, trimmed.toLowerCase()].filter((v) => v.length > 0))
    );
    let referrerDoc: QueryDocumentSnapshot | null = null;
    for (const v of variants) {
      const snap = await adminDb
        .collection('users')
        .where('referralCode', '==', v)
        .limit(1)
        .get();
      if (!snap.empty) {
        referrerDoc = snap.docs[0];
        break;
      }
    }
    if (!referrerDoc) {
      return { ok: false as const, reason: 'invalid_code' as const };
    }
    if (referrerDoc.id === uid) {
      return { ok: false as const, reason: 'self_referral' as const };
    }

    const referrerId = referrerDoc.id;
    const codeFromDoc =
      typeof referrerDoc.data()?.referralCode === 'string'
        ? String(referrerDoc.data()?.referralCode).trim().toUpperCase()
        : '';
    const referredByStored = codeFromDoc || normalized;

    await userRef.update({
      referredBy: referredByStored,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('Referral LINKED:', { user: uid, referredBy: referredByStored, referrerUid: referrerId });

    return { ok: true as const, linked: true as const };
  });
