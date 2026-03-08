import { adminProcedure } from '@/backend/trpc/create-context';
import { firestoreGyms, firestoreCheckIns, firestorePayouts } from '@/backend/lib/firestore-admin';

// Helper to format a Date into "YYYY-MM"
function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

export default adminProcedure.query(async () => {
  const [gyms, checkIns, existingPayouts] = await Promise.all([
    firestoreGyms.getAll(),
    firestoreCheckIns.getAll(),
    firestorePayouts.getAll(),
  ]);

  const gymsById = new Map<string, any>();
  gyms.forEach((g) => gymsById.set(g.id, g));

  // Build map of existing payouts by gymId+month
  const existingByKey = new Map<string, any>();
  existingPayouts.forEach((p) => {
    const key = `${p.gymId}:${p.month}`;
    existingByKey.set(key, p);
  });

  type Aggregate = {
    gymId: string;
    gymName: string;
    month: string;
    totalCheckins: number;
    amount: number;
    payPerVisitRate: number; // Average rate per visit for this month
  };

  const aggregates = new Map<string, Aggregate>();

  // Group check-ins by gym + month and sum payoutAmount
  for (const ci of checkIns) {
    const gym = gymsById.get(ci.gymId);
    if (!gym) continue;

    const monthKey = toMonthKey(new Date(ci.timestamp));
    const aggKey = `${ci.gymId}:${monthKey}`;

    const existing = aggregates.get(aggKey) || {
      gymId: ci.gymId,
      gymName: gym.name || 'Unknown Gym',
      month: monthKey,
      totalCheckins: 0,
      amount: 0,
      payPerVisitRate: 0,
    };

    const payoutAmount = ci.payoutAmount || gym.pricePerVisit || 0;
    existing.totalCheckins += 1;
    existing.amount += payoutAmount;
    
    // Calculate average rate (for display purposes, since rates may vary)
    if (existing.totalCheckins === 1) {
      existing.payPerVisitRate = payoutAmount;
    } else {
      // Weighted average
      existing.payPerVisitRate = existing.amount / existing.totalCheckins;
    }

    aggregates.set(aggKey, existing);
  }

  // Create missing payout docs (one per gym+month)
  for (const agg of aggregates.values()) {
    const key = `${agg.gymId}:${agg.month}`;
    if (!existingByKey.has(key)) {
      await firestorePayouts.create({
        gymId: agg.gymId,
        gymName: agg.gymName,
        month: agg.month,
        totalCheckins: agg.totalCheckins,
        amount: agg.amount,
        payPerVisitRate: agg.payPerVisitRate,
        status: 'pending',
        paidAt: null,
      });
      }
  }

  // Reload payouts after potential inserts
  const payouts = await firestorePayouts.getAll();

  const pending = payouts
    .filter((p) => p.status === 'pending')
    .sort((a, b) => (a.month > b.month ? 1 : a.month < b.month ? -1 : 0)); // oldest first

  const paid = payouts
    .filter((p) => p.status === 'paid')
    .sort((a, b) => {
      const at = (a.paidAt || a.createdAt).getTime();
      const bt = (b.paidAt || b.createdAt).getTime();
      return bt - at; // newest first
    });

  return { pending, paid };
});

