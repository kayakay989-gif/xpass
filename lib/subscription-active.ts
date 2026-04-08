/**
 * Member-facing "has an active plan" — same rules as subscription packages UI:
 * unexpired end date and not explicitly inactive (`isActive !== false`).
 */
export function isSubscriptionActiveForMember(
  subscription: { endDate?: unknown; isActive?: boolean | null } | null | undefined
): boolean {
  if (!subscription) return false;
  const endDate =
    subscription.endDate != null
      ? new Date(subscription.endDate as string | number | Date)
      : null;
  const now = new Date();
  const endValid =
    !!endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() > now.getTime();
  return endValid && subscription.isActive !== false;
}
