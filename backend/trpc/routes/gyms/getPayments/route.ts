import { z } from 'zod';
import { gymOwnerOrAdminProcedure } from '@/backend/trpc/create-context';
import { firestorePayouts, firestoreCheckIns, firestoreGyms } from '@/backend/lib/firestore-admin';

// Helper to format a Date into "YYYY-MM"
function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

export default gymOwnerOrAdminProcedure
  .input(
    z.object({
      gymId: z.string(),
    })
  )
  .query(async ({ input, ctx }) => {
    if (!ctx.isAdmin && ctx.gymOwner?.gymId !== input.gymId) {
      throw new Error('Unauthorized');
    }

    // Ensure payouts exist for this gym by aggregating its check-ins, similar to the admin payouts route.
    const [gym, checkIns, existingPayouts] = await Promise.all([
      firestoreGyms.getById(input.gymId),
      firestoreCheckIns.getByGymId(input.gymId),
      firestorePayouts.getAll(),
    ]);

    if (!gym) {
      return [];
    }

    // Build map of existing payouts for this gym by month
    const existingByMonth = new Map<string, any>();
    existingPayouts
      .filter((p) => p.gymId === input.gymId)
      .forEach((p) => {
        existingByMonth.set(p.month, p);
      });

    type Aggregate = {
      month: string;
      totalCheckins: number;
      amount: number;
      payPerVisitRate: number;
    };

    const aggregates = new Map<string, Aggregate>();

    // Group this gym's check-ins by month and sum payoutAmount
    for (const ci of checkIns) {
      const monthKey = toMonthKey(new Date(ci.timestamp));

      const existingAgg = aggregates.get(monthKey) || {
        month: monthKey,
        totalCheckins: 0,
        amount: 0,
        payPerVisitRate: 0,
      };

      const payoutAmount = (ci as any).payoutAmount || gym.pricePerVisit || 0;
      existingAgg.totalCheckins += 1;
      existingAgg.amount += payoutAmount;

      if (existingAgg.totalCheckins === 1) {
        existingAgg.payPerVisitRate = payoutAmount;
      } else {
        existingAgg.payPerVisitRate = existingAgg.amount / existingAgg.totalCheckins;
      }

      aggregates.set(monthKey, existingAgg);
    }

    // Create missing payout docs for this gym (one per month)
    for (const agg of aggregates.values()) {
      if (!existingByMonth.has(agg.month)) {
        await firestorePayouts.create({
          gymId: input.gymId,
          gymName: gym.name || 'Unknown Gym',
          month: agg.month,
          totalCheckins: agg.totalCheckins,
          amount: agg.amount,
          payPerVisitRate: agg.payPerVisitRate,
          status: 'pending',
          paidAt: null,
        });
      }
    }

    // Reload payouts and return only this gym's payouts (pending + paid)
    const allPayouts = await firestorePayouts.getAll();
    const gymPayouts = allPayouts.filter((p) => p.gymId === input.gymId);

    // Sort by month (newest first)
    return gymPayouts.sort((a, b) => {
      if (a.month > b.month) return -1;
      if (a.month < b.month) return 1;
      return 0;
    });
  });
