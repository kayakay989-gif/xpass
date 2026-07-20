/**
 * Member-facing "has an active plan" — unexpired end date, not explicitly inactive,
 * and at least one pass remaining. Also honors `status` when the backend marks a row active.
 */
function parseEndDate(sub: { endDate?: unknown }): Date | null {
  if (sub.endDate == null) return null;
  const d = new Date(sub.endDate as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getRemainingPasses(subscription: {
  visitsUsed?: number | null;
  maxVisitsPerMonth?: number | null;
} | null | undefined): number {
  if (!subscription) return 0;
  const max = subscription.maxVisitsPerMonth ?? 0;
  const used = subscription.visitsUsed ?? 0;
  return Math.max(0, max - used);
}

export function hasRemainingPasses(subscription: {
  visitsUsed?: number | null;
  maxVisitsPerMonth?: number | null;
} | null | undefined): boolean {
  return getRemainingPasses(subscription) > 0;
}

export function isSubscriptionActiveForMember(
  subscription: {
    endDate?: unknown;
    isActive?: boolean | null;
    status?: string | null;
    paymentStatus?: string | null;
    visitsUsed?: number | null;
    maxVisitsPerMonth?: number | null;
  } | null | undefined
): boolean {
  if (!subscription) return false;

  const endDate = parseEndDate(subscription);
  const nowMs = Date.now();

  if (endDate !== null && endDate.getTime() <= nowMs) {
    return false;
  }

  const endValid = endDate !== null && endDate.getTime() > nowMs;

  const status =
    typeof subscription.status === 'string' ? subscription.status.trim().toLowerCase() : '';
  const paidOk =
    typeof subscription.paymentStatus === 'string' &&
    subscription.paymentStatus.trim().toLowerCase() === 'paid';
  const statusOk =
    status === 'active' ||
    status === 'active_until_expiry' ||
    status === 'paid' ||
    paidOk;

  const cancelled =
    status === 'cancelled' ||
    status === 'refunded' ||
    status === 'expired' ||
    status === 'passes_exhausted';

  // No passes left — treat as ended so the member can resubscribe.
  if (!hasRemainingPasses(subscription)) {
    return false;
  }

  // Unexpired window: treat as active unless explicitly cancelled/refunded.
  if (endValid) {
    if (cancelled) return false;
    if (subscription.isActive === false && !statusOk) return false;
    if (subscription.isActive !== false) return true;
    if (statusOk) return true;
  }

  // Fallback: backend marked paid/active but endDate missing or parsing failed (legacy rows).
  if (statusOk && subscription.isActive !== false && hasRemainingPasses(subscription)) return true;
  if (paidOk && subscription.isActive !== false && hasRemainingPasses(subscription)) return true;

  return false;
}
