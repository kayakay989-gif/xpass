import admin from 'firebase-admin';
import { adminDb } from '@/backend/lib/firebase-admin';

const REFERRAL_REWARD_JOD = 10;

type ReferralRewardInput = {
  referredUserId: string;
  subscriptionId: string;
  referredUserName?: string;
};

/**
 * Awards referral credit only after a qualifying paid subscription succeeds.
 * Idempotent by referredUserId: once rewarded, subsequent subscriptions do not re-award.
 */
export async function awardReferralRewardAfterPaidSubscription(
  input: ReferralRewardInput
): Promise<{ awarded: boolean; reason?: string }> {
  const { referredUserId, subscriptionId, referredUserName } = input;
  console.log('[ReferralReward] evaluating', { referredUserId, subscriptionId });
  const referredUserRef = adminDb.collection('users').doc(referredUserId);

  return adminDb.runTransaction(async (tx) => {
    const referredUserSnap = await tx.get(referredUserRef);
    if (!referredUserSnap.exists) {
      return { awarded: false, reason: 'referred_user_not_found' };
    }

    const referredUserData = referredUserSnap.data() || {};
    const referredByCode =
      typeof referredUserData.referredBy === 'string'
        ? referredUserData.referredBy.trim().toUpperCase()
        : '';

    if (!referredByCode) {
      console.log('[ReferralReward] no referral code used', { referredUserId });
      return { awarded: false, reason: 'no_referral_code_used' };
    }
    console.log('[ReferralReward] referral code detected', { referredUserId, referralCode: referredByCode });

    const existingRewardQuery = adminDb
      .collection('referralTransactions')
      .where('referredUserId', '==', referredUserId)
      .limit(1);
    const existingRewardSnap = await tx.get(existingRewardQuery);
    if (!existingRewardSnap.empty) {
      console.log('[ReferralReward] already rewarded', { referredUserId });
      return { awarded: false, reason: 'already_rewarded' };
    }

    const referrerQuery = adminDb
      .collection('users')
      .where('referralCode', '==', referredByCode)
      .limit(1);
    const referrerSnap = await tx.get(referrerQuery);
    if (referrerSnap.empty) {
      console.log('[ReferralReward] referrer not found', { referredByCode });
      return { awarded: false, reason: 'referrer_not_found' };
    }

    const referrerDoc = referrerSnap.docs[0];
    if (referrerDoc.id === referredUserId) {
      console.log('[ReferralReward] blocked self referral', { referredUserId });
      return { awarded: false, reason: 'self_referral_blocked' };
    }

    const referrerData = referrerDoc.data() || {};
    const currentWalletBalance =
      typeof referrerData.walletBalance === 'number' ? referrerData.walletBalance : 0;
    const newWalletBalance = currentWalletBalance + REFERRAL_REWARD_JOD;

    tx.update(referrerDoc.ref, {
      walletBalance: newWalletBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const walletTxnRef = adminDb.collection('walletTransactions').doc();
    tx.set(walletTxnRef, {
      userId: referrerDoc.id,
      type: 'referral_reward',
      amount: REFERRAL_REWARD_JOD,
      description: `Referral reward from ${
        referredUserName?.trim() || 'a referred user'
      } after paid subscription`,
      relatedUserId: referredUserId,
      subscriptionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const referralTxnRef = adminDb.collection('referralTransactions').doc();
    tx.set(referralTxnRef, {
      referrerId: referrerDoc.id,
      referredUserId,
      rewardAmount: REFERRAL_REWARD_JOD,
      referrerCode: referredByCode,
      subscriptionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('[ReferralReward] reward transaction queued', {
      referredUserId,
      referrerId: referrerDoc.id,
      rewardAmount: REFERRAL_REWARD_JOD,
      referralCode: referredByCode,
    });

    return { awarded: true };
  });
}

