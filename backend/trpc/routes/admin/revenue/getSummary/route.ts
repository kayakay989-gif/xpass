import { z } from "zod";
import { adminProcedure } from "@/backend/trpc/create-context";
import {
  firestoreSubscriptions,
  firestorePayments,
  firestoreUsers,
} from "@/backend/lib/firestore-admin";
import { enrichUsersForAdmin } from "@/backend/lib/enrich-users-with-auth";
import { resolveMemberDisplayName } from "@/lib/profile-validation";
import {
  isExpiredInAmman,
  startOfAmmanDay,
  endOfAmmanDay,
  ammanYearMonth,
  startOfAmmanMonth,
  endOfAmmanMonth,
  addAmmanCalendarDays,
} from "@/lib/jordan-time";

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
  const { year, month } = ammanYearMonth(new Date());

  switch (range) {
    case "THIS_MONTH":
      return {
        start: startOfAmmanMonth(year, month),
        end: endOfAmmanMonth(year, month),
      };
    case "LAST_MONTH": {
      const prevYmd = addAmmanCalendarDays(
        `${year}-${String(month).padStart(2, "0")}-01`,
        -1
      );
      const [y, m] = prevYmd.split("-").map(Number);
      return {
        start: startOfAmmanMonth(y, m),
        end: endOfAmmanMonth(y, m),
      };
    }
    case "LAST_3_MONTHS": {
      let startYear = year;
      let startMonth = month - 2;
      while (startMonth < 1) {
        startMonth += 12;
        startYear -= 1;
      }
      return {
        start: startOfAmmanMonth(startYear, startMonth),
        end: endOfAmmanMonth(year, month),
      };
    }
    case "LAST_12_MONTHS": {
      let startYear = year;
      let startMonth = month - 11;
      while (startMonth < 1) {
        startMonth += 12;
        startYear -= 1;
      }
      return {
        start: startOfAmmanMonth(startYear, startMonth),
        end: endOfAmmanMonth(year, month),
      };
    }
    case "ALL_TIME":
      return { start: null, end: null };
    case "CUSTOM":
      if (!customStart || !customEnd) {
        return { start: null, end: null };
      }
      return {
        start: startOfAmmanDay(customStart),
        end: endOfAmmanDay(customEnd),
      };
    default:
      return { start: null, end: null };
  }
};

const toDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val.toDate) return val.toDate();
  if (typeof val === "string") return new Date(val);
  if (val._seconds) return new Date(val._seconds * 1000);
  return null;
};

const isPaidSubscription = (sub: any): boolean => {
  const paymentStatus = (sub.paymentStatus || "").toLowerCase();
  const status = (sub.status || "").toLowerCase();
  const amount = typeof sub.totalPrice === "number" ? sub.totalPrice : 0;
  if (amount <= 0) return false;
  if (["pending", "failed", "unpaid", "refunded"].includes(paymentStatus))
    return false;
  if (["pending", "cancelled", "canceled"].includes(status)) return false;
  return true;
};

const formatPaymentSource = (method?: string | null): string => {
  switch ((method || "").toLowerCase()) {
    case "apple_pay":
      return "Apple Pay";
    case "google_pay":
      return "Google Pay";
    case "coupon":
      return "Coupon";
    case "wallet":
      return "Wallet balance";
    case "card":
      return "Card";
    default:
      return "Subscription";
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
        .default("ALL_TIME"),
      startDate: z.string().datetime().nullable().optional(),
      endDate: z.string().datetime().nullable().optional(),
    })
  )
  .query(async ({ input }) => {
    const { range } = input;
    const customStart = input.startDate ? new Date(input.startDate) : null;
    const customEnd = input.endDate ? new Date(input.endDate) : null;

    console.log("[AdminRevenue] getSummary requested with range:", input.range);

    const [allSubscriptionsRaw, allPaymentsRaw, enrichedUsers] =
      await Promise.all([
        firestoreSubscriptions.getAll(),
        firestorePayments.listAll(),
        enrichUsersForAdmin(await firestoreUsers.getAll()),
      ]);

    const userById = new Map(enrichedUsers.map((u) => [u.id, u]));

    const paymentBySubscriptionId = new Map<string, any>();
    for (const payment of allPaymentsRaw) {
      const subId = payment.subscriptionId ? String(payment.subscriptionId) : "";
      if (subId) {
        paymentBySubscriptionId.set(subId, payment);
      }
    }

    const revenueEvents = allSubscriptionsRaw
      .filter(isPaidSubscription)
      .map((sub) => {
        const payment = paymentBySubscriptionId.get(sub.id);
        const user = userById.get(sub.userId);
        const paidAt =
          toDate(sub.createdAt) ||
          toDate(sub.startDate) ||
          toDate(payment?.completedAt) ||
          toDate(payment?.createdAt);

        const amountPaid =
          typeof sub.totalPrice === "number" && sub.totalPrice > 0
            ? sub.totalPrice
            : payment?.totalAmount ?? payment?.amount ?? 0;

        const paymentMethod =
          payment?.paymentMethod != null
            ? String(payment.paymentMethod)
            : "subscription";

        return {
          id: sub.id,
          subscriptionId: sub.id,
          userId: sub.userId,
          subscriberName:
            resolveMemberDisplayName(user?.name, user?.authDisplayName) ||
            "Unknown subscriber",
          subscriberEmail: user?.email || "",
          tier: sub.tier,
          duration: sub.duration,
          amount: amountPaid,
          originalAmount: payment?.originalAmount ?? amountPaid,
          discountAmount: payment?.discountAmount ?? 0,
          couponCode: payment?.couponCode ?? null,
          currency: "JOD",
          paymentMethod,
          paymentSource: formatPaymentSource(paymentMethod),
          createdAt: paidAt,
        };
      })
      .filter((p) => !!p.createdAt)
      .sort(
        (a, b) =>
          (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()
      );

    const now = new Date();
    const isSameMonth = (d: Date, base: Date) =>
      d.getFullYear() === base.getFullYear() &&
      d.getMonth() === base.getMonth();

    const thisMonthRevenue = revenueEvents
      .filter((p) => p.createdAt && isSameMonth(p.createdAt, now))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthRevenue = revenueEvents
      .filter((p) => p.createdAt && isSameMonth(p.createdAt, lastMonthDate))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const allTimeRevenue = revenueEvents.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    const activeSubscribers = allSubscriptionsRaw.filter((sub: any) => {
      const status = (sub.status || "").toLowerCase();
      const isActiveFlag = sub.isActive === true;
      if (!sub.endDate) {
        return status === "active" || isActiveFlag;
      }
      const end =
        sub.endDate instanceof Date ? sub.endDate : new Date(sub.endDate);
      const notExpired = !isExpiredInAmman(end, now);
      return notExpired && (status === "active" || isActiveFlag);
    }).length;

    const { start, end } = getRangeDates(
      range as RevenueRange,
      customStart,
      customEnd
    );

    const inRangePayments = revenueEvents.filter((p) => {
      if (!p.createdAt) return false;
      if (start && p.createdAt < start) return false;
      if (end && p.createdAt > end) return false;
      return true;
    });

    const rangeTotalRevenue = inRangePayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

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
        return { monthKey, label, amount };
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
        paymentCount: inRangePayments.length,
        byMonth,
        payments: inRangePayments.map((p) => ({
          id: p.id,
          subscriptionId: p.subscriptionId,
          userId: p.userId,
          subscriberName: p.subscriberName,
          subscriberEmail: p.subscriberEmail,
          tier: p.tier,
          duration: p.duration,
          amount: p.amount,
          originalAmount: p.originalAmount,
          discountAmount: p.discountAmount,
          couponCode: p.couponCode,
          currency: p.currency,
          paymentMethod: p.paymentMethod,
          paymentSource: p.paymentSource,
          createdAt: p.createdAt ? p.createdAt.toISOString() : null,
        })),
      },
    };
  });
