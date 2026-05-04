import admin from 'firebase-admin';
import { adminDb } from '@/backend/lib/firebase-admin';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';

const REFERRAL_REWARD_JOD = 10;

const CLAIM_COLLECTION = 'referralRewardClaims';

/** Firebase UID–shaped strings must keep original casing for Firestore document reads. */
const UID_LIKE = /^[a-zA-Z0-9]{10,35}$/;

export type ReferralAwardResult = {
  awarded: boolean;
  reason?: string;
  resolutionPath?: 'referralCode' | 'uid' | 'none';
  alreadyRewarded?: boolean;
};

type ReferralSubscriptionContext = {
  payerUserId: string;
  subscriptionId: string;
  subscriptionIsActive: boolean;
  referredUserName?: string;
};

function safeClaimDocId(referredUserId: string, subscriptionId: string): string {
  return `${referredUserId}__${subscriptionId.replace(/\//g, '_')}`;
}

function refFailure(reason: string, detail?: Record<string, unknown>): void {
  console.error('REFERRAL FAILURE REASON:', reason, detail ?? '');
}

/**
 * Parse referredBy: reject empty / objects / arrays; preserve UID casing; trim codes.
 */
function parseReferredByFromUserDoc(data: Record<string, unknown> | undefined): {
  raw: string;
} | null {
  if (!data) return null;
  const v = data.referredBy;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    console.log('[ReferralReward] rejected referredBy: non-primitive object');
    refFailure('parseReferredBy: referredBy was object/array');
    return null;
  }
  const raw = typeof v === 'string' ? v.trim() : String(v).trim();
  if (!raw) return null;
  console.log('[ReferralReward] normalized referredBy:', raw);
  return { raw };
}

async function getReferrerSnapshotByCodeInTransaction(tx: Transaction, raw: string) {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  const variants = Array.from(new Set([trimmed, upper, lower].filter((x) => x.length > 0)));
  for (const qv of variants) {
    const q = adminDb.collection('users').where('referralCode', '==', qv).limit(1);
    const snap = await tx.get(q);
    if (!snap.empty) return snap;
  }
  return await tx.get(
    adminDb.collection('users').where('referralCode', '==', upper).limit(1)
  );
}

type ResolveReferrerResult =
  | { kind: 'ok'; doc: DocumentSnapshot; path: 'referralCode' | 'uid' }
  | { kind: 'self' }
  | { kind: 'not_found' };

async function resolveReferrerInTransaction(
  tx: Transaction,
  raw: string,
  referredUserId: string
): Promise<ResolveReferrerResult> {
  console.log('[ReferralReward] resolving referrer via referralCode');
  const codeSnap = await getReferrerSnapshotByCodeInTransaction(tx, raw);
  if (!codeSnap.empty) {
    const d = codeSnap.docs[0];
    if (d.id === referredUserId) return { kind: 'self' };
    console.log('[ReferralReward] Resolved referrer:', d.id, '(via referralCode)');
    return { kind: 'ok', doc: d, path: 'referralCode' };
  }

  console.log('[ReferralReward] fallback: resolving via UID');
  if (!UID_LIKE.test(raw.trim())) {
    refFailure('referrer_not_found_after_all_strategies', { raw: raw.slice(0, 80) });
    console.log('[ReferralReward] FAILED: referrer not found after all strategies');
    return { kind: 'not_found' };
  }

  const byUid = await tx.get(adminDb.collection('users').doc(raw.trim()));
  if (!byUid.exists) {
    refFailure('referrer_not_found_after_all_strategies', { uidLookup: raw.trim() });
    console.log('[ReferralReward] FAILED: referrer not found after all strategies');
    return { kind: 'not_found' };
  }
  if (byUid.id === referredUserId) return { kind: 'self' };
  console.log('[ReferralReward] Resolved referrer:', byUid.id, '(via UID)');
  return { kind: 'ok', doc: byUid, path: 'uid' };
}

type ReferralRewardInput = {
  referredUserId: string;
  subscriptionId: string;
  referredUserName?: string;
};

export async function awardReferralRewardAfterPaidSubscription(
  input: ReferralRewardInput
): Promise<ReferralAwardResult> {
  const { referredUserId, subscriptionId, referredUserName } = input;
  console.log('[ReferralReward] evaluating', { referredUserId, subscriptionId });
  const referredUserRef = adminDb.collection('users').doc(referredUserId);
  const claimId = safeClaimDocId(referredUserId, subscriptionId);
  const claimRef = adminDb.collection(CLAIM_COLLECTION).doc(claimId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      console.log('RUNNING TRANSACTION for referral reward');

      const referredUserSnap = await tx.get(referredUserRef);
      if (!referredUserSnap.exists) {
        refFailure('referred_user_not_found', { referredUserId });
        return { awarded: false, reason: 'referred_user_not_found', resolutionPath: 'none' as const };
      }

      console.log('Checking claim:', claimId);
      const claimSnap = await tx.get(claimRef);
      console.log('Claim exists:', claimSnap.exists);
      if (claimSnap.exists) {
        refFailure('already_rewarded_subscription_claim', { referredUserId, subscriptionId, claimId });
        return {
          awarded: false,
          reason: 'already_rewarded_subscription',
          alreadyRewarded: true,
          resolutionPath: 'none' as const,
        };
      }

      const referredUserData = (referredUserSnap.data() || {}) as Record<string, unknown>;
      const parsed = parseReferredByFromUserDoc(referredUserData);
      if (!parsed) {
        refFailure('no_referral_linkage_on_payer', {
          referredUserId,
          rawReferredBy: referredUserData.referredBy,
        });
        return { awarded: false, reason: 'no_referral_code_used', resolutionPath: 'none' as const };
      }
      const { raw } = parsed;

      const existingRewardQuery = adminDb
        .collection('referralTransactions')
        .where('referredUserId', '==', referredUserId)
        .limit(1);
      const existingRewardSnap = await tx.get(existingRewardQuery);
      const alreadyRewardedReferee = !existingRewardSnap.empty;
      console.log('Lifetime referral row exists (one reward per referee):', alreadyRewardedReferee);
      if (alreadyRewardedReferee) {
        refFailure('already_rewarded_lifetime_for_referee', { referredUserId });
        return {
          awarded: false,
          reason: 'already_rewarded',
          alreadyRewarded: true,
          resolutionPath: 'none' as const,
        };
      }

      const resolved = await resolveReferrerInTransaction(tx, raw, referredUserId);
      if (resolved.kind === 'self') {
        refFailure('self_referral_blocked', { referredUserId });
        return { awarded: false, reason: 'self_referral_blocked', resolutionPath: 'none' as const };
      }
      if (resolved.kind === 'not_found') {
        refFailure('referrer_not_found', { referredByRaw: raw });
        return { awarded: false, reason: 'referrer_not_found', resolutionPath: 'none' as const };
      }

      const { doc: referrerDoc, path: resolutionPath } = resolved;
      console.log('Resolved referrer:', referrerDoc.id);

      const referrerData = referrerDoc.data() || {};
      const rawBal = referrerData.walletBalance;
      const currentWalletBalance =
        typeof rawBal === 'number'
          ? rawBal
          : typeof rawBal === 'string'
            ? parseFloat(rawBal)
            : NaN;
      const safeBefore = Number.isFinite(currentWalletBalance) ? currentWalletBalance : 0;
      console.log('[ReferralReward] Before reward:', { referrerId: referrerDoc.id, currentBalance: safeBefore });

      console.log('Incrementing wallet for:', referrerDoc.id);
      tx.update(referrerDoc.ref, {
        walletBalance: admin.firestore.FieldValue.increment(REFERRAL_REWARD_JOD),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const expectedAfter = safeBefore + REFERRAL_REWARD_JOD;
      console.log('[ReferralReward] After reward (expected):', {
        referrerId: referrerDoc.id,
        updatedBalance: expectedAfter,
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
        referrerCode: UID_LIKE.test(raw.trim()) ? raw.trim() : raw.trim().toUpperCase(),
        subscriptionId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(claimRef, {
        referredUserId,
        subscriptionId,
        referrerId: referrerDoc.id,
        rewardAmount: REFERRAL_REWARD_JOD,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Wallet increment success for referrer: ${referrerDoc.id}`);

      return { awarded: true, resolutionPath };
    });

    console.log('Transaction committed successfully', { awarded: result.awarded, reason: result.reason });
    return result;
  } catch (err: any) {
    console.error('[ReferralReward] ERROR: wallet update failed', err);
    refFailure('transaction_failed', { message: err?.message, stack: err?.stack });
    return { awarded: false, reason: 'transaction_failed', resolutionPath: 'none' };
  }
}

export async function runReferralRewardAfterSubscriptionSuccess(
  ctx: ReferralSubscriptionContext
): Promise<void> {
  console.log('ENTERED referral reward function');

  const flow: {
    eligibility: boolean;
    reason: string;
    resolutionPath: string;
    alreadyRewarded: boolean;
    wallet: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  } = {
    eligibility: false,
    reason: '',
    resolutionPath: 'n/a',
    alreadyRewarded: false,
    wallet: 'SKIPPED',
  };

  console.log('--- REFERRAL FLOW START ---');

  try {
    const userDoc = await adminDb.collection('users').doc(ctx.payerUserId).get();
    const d = userDoc.data();
    console.log('User doc fetched:', {
      payerUserId: ctx.payerUserId,
      exists: userDoc.exists,
      email: d?.email,
      referredBy: d?.referredBy,
      referralCode: d?.referralCode,
    });
    console.log('Raw referredBy:', d?.referredBy ?? null);

    const referredAttached = d?.referredBy ?? null;

    console.log('Payment success for user:', ctx.payerUserId);
    console.log('Referral attached:', referredAttached);

    if (!ctx.subscriptionIsActive) {
      flow.reason = 'subscription not active — referral not evaluated';
      refFailure('subscription_inactive_skip', { payerUserId: ctx.payerUserId });
      console.log('Reward eligibility: FALSE');
      console.log('Reason:', flow.reason);
      console.log('Referrer resolution path: failed');
      console.log('Already rewarded: FALSE');
      console.log('Wallet update: SKIPPED');
      console.log('--- REFERRAL FLOW END ---');
      return;
    }

    const result = await awardReferralRewardAfterPaidSubscription({
      referredUserId: ctx.payerUserId,
      subscriptionId: ctx.subscriptionId,
      referredUserName: ctx.referredUserName,
    });

    const pathLabel =
      result.resolutionPath === 'referralCode'
        ? 'referralCode'
        : result.resolutionPath === 'uid'
          ? 'uid'
          : 'failed';

    const reasonText =
      result.reason === 'no_referral_code_used'
        ? 'no referral linkage on payer profile (ROOT: referredBy missing on users/{payer} at payment time — fix client signup / applyReferralCode)'
        : result.reason === 'referrer_not_found'
          ? 'referrer could not be resolved'
          : result.reason === 'self_referral_blocked'
            ? 'self-referral not allowed'
            : result.reason === 'already_rewarded' || result.reason === 'already_rewarded_subscription'
              ? String(result.reason)
              : result.reason === 'transaction_failed'
                ? 'Firestore transaction failed'
                : result.reason === 'referred_user_not_found'
                  ? 'payer user document missing'
                  : result.awarded
                    ? 'referral reward committed'
                    : String(result.reason || 'unknown');

    if (!result.awarded && result.reason) {
      refFailure(reasonText, { code: result.reason });
    }

    flow.reason = reasonText;
    flow.resolutionPath = pathLabel;
    flow.alreadyRewarded = !!result.alreadyRewarded;

    if (result.awarded) {
      flow.wallet = 'SUCCESS';
      flow.eligibility = true;
    } else if (result.reason === 'transaction_failed') {
      flow.wallet = 'FAILED';
      flow.eligibility = false;
    } else {
      flow.wallet = 'SKIPPED';
      flow.eligibility = false;
    }

    console.log('Referrer resolution path:', pathLabel);
    console.log('Reward eligibility:', result.awarded ? 'TRUE' : 'FALSE');
    console.log('Reason:', reasonText);
    console.log('Already rewarded:', flow.alreadyRewarded ? 'TRUE' : 'FALSE');
    console.log(
      'Wallet update:',
      flow.wallet === 'SUCCESS' ? 'SUCCESS' : flow.wallet === 'FAILED' ? 'FAILED' : 'SKIPPED'
    );
  } catch (e: any) {
    flow.wallet = 'FAILED';
    refFailure('referral_flow_exception', { message: e?.message });
    console.error('[ReferralReward] ERROR: referral flow failed', e);
    console.log('Referrer resolution path: failed');
    console.log('Reward eligibility: FALSE');
    console.log('Reason:', e?.message || 'unexpected error');
    console.log('Already rewarded: FALSE');
    console.log('Wallet update: FAILED');
  }

  console.log('--- REFERRAL FLOW END ---');
}
