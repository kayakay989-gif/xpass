/**
 * Temporary benchmark: membership loading backend path, old vs new.
 * Run: npx tsx scripts/bench-membership-load.ts
 *
 * Measures against live Firestore:
 *  1. OLD path: sequential (userId+isActive) query, then full userId query when empty
 *     + the users/{uid} role read previously done in createContext for every request.
 *  2. NEW path: single userId query (role read eliminated for member routes).
 * Also verifies the selected subscription is identical between old and new logic.
 */

import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

import { adminDb } from '../backend/lib/firebase-admin';
import { firestoreSubscriptions } from '../backend/lib/firestore-admin';

const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp && typeof timestamp === 'object' && timestamp._seconds) {
    return new Date(timestamp._seconds * 1000);
  }
  return new Date();
};

/** Replica of the OLD getMemberViewSubscription (2 sequential queries). */
async function oldGetMemberView(userId: string): Promise<{ id: string | null; queries: number }> {
  const activeSnap = await adminDb
    .collection('subscriptions')
    .where('userId', '==', userId)
    .where('isActive', '==', true)
    .get();

  if (!activeSnap.empty) {
    const sorted = activeSnap.docs.sort((a, b) => {
      const aTime = timestampToDate(a.data().createdAt).getTime();
      const bTime = timestampToDate(b.data().createdAt).getTime();
      return bTime - aTime;
    });
    return { id: sorted[0].id, queries: 1 };
  }

  const snapshot = await adminDb.collection('subscriptions').where('userId', '==', userId).get();
  if (snapshot.empty) return { id: null, queries: 2 };

  const now = Date.now();
  const candidates = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      endDate: timestampToDate(doc.data().endDate),
      isActive: doc.data().isActive,
    }))
    .filter((s) => {
      const end = s.endDate ? new Date(s.endDate).getTime() : 0;
      return Number.isFinite(end) && end > now && s.isActive !== false;
    })
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());

  return { id: candidates[0]?.id ?? null, queries: 2 };
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

async function main() {
  // Sample distinct userIds from subscriptions
  const sample = await adminDb.collection('subscriptions').limit(200).get();
  const userIds = [...new Set(sample.docs.map((d) => d.data().userId).filter(Boolean))].slice(0, 15);
  console.log(`Benchmarking ${userIds.length} users\n`);

  let oldTotal = 0;
  let newTotal = 0;
  let oldRoleTotal = 0;
  let mismatches = 0;

  for (const userId of userIds) {
    // OLD: role read (createContext) + old query path, sequential as production was
    const oldRun = await timeIt(async () => {
      const roleStart = Date.now();
      await adminDb.collection('users').doc(userId).get();
      const roleMs = Date.now() - roleStart;
      const res = await oldGetMemberView(userId);
      return { ...res, roleMs };
    });

    // NEW: single query, no role read
    const newRun = await timeIt(() => firestoreSubscriptions.getMemberViewSubscription(userId));

    const oldId = oldRun.result.id;
    const newId = newRun.result?.id ?? null;
    const match = oldId === newId;
    if (!match) mismatches++;

    oldTotal += oldRun.ms;
    newTotal += newRun.ms;
    oldRoleTotal += oldRun.result.roleMs;

    console.log(
      `${userId.slice(0, 8)}…  old=${oldRun.ms}ms (queries=${oldRun.result.queries}, role=${oldRun.result.roleMs}ms)  new=${newRun.ms}ms  result_match=${match ? 'YES' : `NO old=${oldId} new=${newId}`}`
    );
  }

  console.log(`\n=== Summary (${userIds.length} users) ===`);
  console.log(`OLD avg per request: ${(oldTotal / userIds.length).toFixed(0)}ms (incl. avg role read ${(oldRoleTotal / userIds.length).toFixed(0)}ms)`);
  console.log(`NEW avg per request: ${(newTotal / userIds.length).toFixed(0)}ms`);
  console.log(`Result mismatches: ${mismatches}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Benchmark failed:', e?.message || e);
    process.exit(1);
  });
