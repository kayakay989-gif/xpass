/**
 * Member-facing "has an active plan" — same rules as subscription packages UI:
 * unexpired end date and not explicitly inactive (`isActive !== false`).
 * Also honors `status` when the backend marks a row active (aligns with web/admin).
 */
function parseEndDate(sub: { endDate?: unknown }): Date | null {
  if (sub.endDate == null) return null;
  const d = new Date(sub.endDate as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isSubscriptionActiveForMember(
  subscription: {
    endDate?: unknown;
    isActive?: boolean | null;
    status?: string | null;
    paymentStatus?: string | null;
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
    status === 'expired';

  // Unexpired window: treat as active unless explicitly cancelled/refunded.
  if (endValid) {
    if (cancelled) return false;
    if (subscription.isActive === false && !statusOk) return false;
    if (subscription.isActive !== false) return true;
    if (statusOk) return true;
  }

  // Fallback: backend marked paid/active but endDate missing or parsing failed (legacy rows).
  if (statusOk && subscription.isActive !== false) return true;
  if (paidOk && subscription.isActive !== false) return true;

  return false;
}
