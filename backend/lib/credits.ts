import admin from 'firebase-admin';
import { adminDb } from '@/backend/lib/firebase-admin';
import { firestoreCheckIns, firestoreSubscriptions } from '@/backend/lib/firestore-admin';
import {
  ammanDayKey,
  getPreviousAmmanDayStart,
  isExpiredInAmman,
} from '@/lib/jordan-time';

export async function applyDailyMissedCheckInCreditDeduction(runDate: Date = new Date()): Promise<void> {
  // Apply deduction for the previous Jordan calendar day.
  const targetDate = getPreviousAmmanDayStart(runDate);

  const activeSubscriptions = await firestoreSubscriptions.getAllActive();
  for (const subscription of activeSubscriptions) {
    if (!subscription.userId || !subscription.id) continue;
    if (subscription.endDate && isExpiredInAmman(subscription.endDate, runDate)) continue;

    if (subscription.visitsUsed >= subscription.maxVisitsPerMonth) {
      await firestoreSubscriptions.update(subscription.id, {
        isActive: false,
        status: 'passes_exhausted',
      });
      continue;
    }

    const hasCheckIn = await firestoreCheckIns.hasCheckInOnDate(subscription.userId, targetDate);
    if (hasCheckIn) continue;

    const deductionId = `${subscription.id}-${ammanDayKey(targetDate)}`;
    const deductionRef = adminDb.collection('creditDeductions').doc(deductionId);
    const deductionSnap = await deductionRef.get();
    if (deductionSnap.exists) continue;

    const nextVisitsUsed = Math.min(
      subscription.maxVisitsPerMonth,
      (subscription.visitsUsed || 0) + 1
    );

    await adminDb.runTransaction(async (tx) => {
      const currentSubRef = adminDb.collection('subscriptions').doc(subscription.id);
      const currentSubSnap = await tx.get(currentSubRef);
      if (!currentSubSnap.exists) return;
      const currentData: any = currentSubSnap.data() || {};
      const currentVisits = Number(currentData.visitsUsed || 0);
      const currentMax = Number(currentData.maxVisitsPerMonth || 30);
      if (currentVisits >= currentMax) return;

      const nextVisitsUsed = Math.min(currentMax, currentVisits + 1);
      const update: Record<string, unknown> = {
        visitsUsed: nextVisitsUsed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (nextVisitsUsed >= currentMax) {
        update.isActive = false;
        update.status = 'passes_exhausted';
      }

      tx.update(currentSubRef, update);
      tx.set(deductionRef, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        date: ammanDayKey(targetDate),
        reason: 'no_checkin_daily_deduction',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }
}
