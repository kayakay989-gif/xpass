import { z } from "zod";
import { adminProcedure } from "@/backend/trpc/create-context";
import { firestoreSubscriptions, firestoreUsers } from "@/backend/lib/firestore-admin";

type RevenueRange =
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_3_MONTHS"
  | "LAST_12_MONTHS"
  | "ALL_TIME"
  | "CUSTOM";

const getRangeDates = (
  range: RevenueRange,
  customStart?: Date | null,
  customEnd?: Date | null
): { start: Date | null; end: Date | null } => {
  const now = new Date();
  const startOfMonth = (year: number, monthIndex: number) => {
    return new Date(year, monthIndex, 1, 0, 0, 0, 0);
  };
  const endOfMonth = (year: number, monthIndex: number) => {
    return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  };

  const year = now.getFullYear();
  const month = now.getMonth();

  switch (range) {
    case "THIS_MONTH":
      return {
        start: startOfMonth(year, month),
        end: endOfMonth(year, month),
      };
    case "LAST_MONTH": {
      const lastMonthDate = new Date(year, month - 1, 1);
      const y = lastMonthDate.getFullYear();
      const m = lastMonthDate.getMonth();
      return {
        start: startOfMonth(y, m),
        end: endOfMonth(y, m),
      };
    }
    case "LAST_3_MONTHS": {
      const startDate = new Date(year, month - 2, 1);
      return {
        start: startOfMonth(startDate.getFullYear(), startDate.getMonth()),
        end: endOfMonth(year, month),
      };
    }
    case "LAST_12_MONTHS": {
      const startDate = new Date(year, month - 11, 1);
      return {
        start: startOfMonth(startDate.getFullYear(), startDate.getMonth()),
        end: endOfMonth(year, month),
      };
    }
    case "ALL_TIME":
      return { start: null, end: null };
    case "CUSTOM":
      if (!customStart || !customEnd) {
        return { start: null, end: null };
      }
      // Normalize to full days
      const s = new Date(customStart);
      s.setHours(0, 0, 0, 0);
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    default:
      return { start: null, end: null };
  }
};

export default adminProcedure
  .input(
    z.object({
      range: z
        .enum([
          "THIS_MONTH",
          "LAST_MONTH",
          "LAST_3_MONTHS",
          "LAST_12_MONTHS",
          "ALL_TIME",
          "CUSTOM",
        ])
        .default("THIS_MONTH"),
      startDate: z.string().datetime().nullable().optional(),
      endDate: z.string().datetime().nullable().optional(),
    })
  )
  .query(async ({ input }) => {
    const { range } = input;

    const customStart = input.startDate ? new Date(input.startDate) : null;
    const customEnd = input.endDate ? new Date(input.endDate) : null;

    // Load all subscriptions once. We'll derive revenue and actives from here.
    console.log("[AdminRevenue] getSummary requested with range:", input.range);
    const allSubscriptionsRaw = await firestoreSubscriptions.getAll();
    console.log("[AdminRevenue] Total subscriptions loaded:", allSubscriptionsRaw.length);

    const toDate = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return val;
      if (val.toDate) return val.toDate();
      if (typeof val === "string") return new Date(val);
      if (val._seconds) return new Date(val._seconds * 1000);
      return null;
    };

    const subscriptionsForRevenue = allSubscriptionsRaw.filter((sub: any) => {
      const paymentStatus = (sub.paymentStatus || "").toLowerCase();
      const status = (sub.status || "").toLowerCase();
      const amount = typeof sub.totalPrice === "number" ? sub.totalPrice : 0;
      const isPaid = paymentStatus === "paid";
      const isActiveStatus = status === "active";
      return amount > 0 && (isPaid || isActiveStatus);
    });

    const payments = subscriptionsForRevenue
      .map((sub: any) => {
        const createdAt: Date | null =
          toDate(sub.createdAt) || toDate(sub.startDate) || null;
        return {
          id: sub.id,
          userId: sub.userId,
          tier: sub.tier,
          duration: sub.duration,
          amount: sub.totalPrice,
          currency: "JOD",
          paymentMethod: "subscription",
          createdAt,
        };
      })
      .filter((p) => !!p.createdAt)
      .sort(
        (a, b) =>
          (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()
      );

    const now = new Date();
    const isSameMonth = (d: Date, base: Date) => {
      return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth();
    };

    const thisMonthRevenue = payments
      .filter((p) => p.createdAt && isSameMonth(p.createdAt, now))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthRevenue = payments
      .filter((p) => p.createdAt && isSameMonth(p.createdAt, lastMonthDate))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const allTimeRevenue = payments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    // Active subscribers:
    // - Prefer explicit status === "active" when present
    // - Fallback to legacy flag isActive === true
    // - And subscription must not be expired by endDate
    const activeSubscribers = allSubscriptionsRaw.filter((sub: any) => {
      const status = (sub.status || "").toLowerCase();
      const isActiveFlag = sub.isActive === true;
      if (!sub.endDate) {
        return status === "active" || isActiveFlag;
      }
      const end = sub.endDate instanceof Date ? sub.endDate : new Date(sub.endDate);
      const notExpired = end.getTime() >= now.getTime();
      return notExpired && (status === "active" || isActiveFlag);
    }).length;

    console.log("[AdminRevenue] Active subscribers:", activeSubscribers);
    console.log("[AdminRevenue] This month revenue:", thisMonthRevenue);
    console.log("[AdminRevenue] Last month revenue:", lastMonthRevenue);
    console.log("[AdminRevenue] All time revenue:", allTimeRevenue);

    // Range-specific revenue + chart + table data
    const { start, end } = getRangeDates(range as RevenueRange, customStart, customEnd);

    const inRangePayments = payments.filter((p) => {
      if (!p.createdAt) return false;
      if (start && p.createdAt < start) return false;
      if (end && p.createdAt > end) return false;
      return true;
    });

    const rangeTotalRevenue = inRangePayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    // Group by month for chart
    const monthBuckets: Record<string, number> = {};
    inRangePayments.forEach((p) => {
      if (!p.createdAt) return;
      const d = p.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthBuckets[key] = (monthBuckets[key] || 0) + (p.amount || 0);
    });

    const byMonth = Object.entries(monthBuckets)
      .map(([monthKey, amount]) => {
        const [y, m] = monthKey.split("-").map((v) => parseInt(v, 10));
        const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
        return {
          monthKey,
          label,
          amount,
        };
      })
      .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1));

    return {
      summaryCards: {
        thisMonthRevenue,
        lastMonthRevenue,
        allTimeRevenue,
        activeSubscribers,
      },
      range: {
        range,
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null,
        totalRevenue: rangeTotalRevenue,
        byMonth,
        payments: inRangePayments.map((p) => ({
          id: p.id,
          userId: p.userId,
          tier: p.tier,
          duration: p.duration,
          amount: p.amount,
          currency: p.currency,
          paymentMethod: p.paymentMethod,
          createdAt: p.createdAt ? p.createdAt.toISOString() : null,
        })),
      },
    };
  });

