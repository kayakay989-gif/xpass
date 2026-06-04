/**
 * Structured check-in sync diagnostics (no passwords, emails, or payment data).
 */

export type CheckInSyncLogEvent = {
  event:
    | 'check_in_create_start'
    | 'check_in_persisted'
    | 'check_in_create_failed'
    | 'gym_check_ins_query'
    | 'gym_dashboard_fetch';
  userId?: string;
  gymId?: string;
  checkInId?: string;
  persisted?: boolean;
  reason?: string;
  rawCount?: number;
  returnedCount?: number;
  filteredCount?: number;
  lookupMethod?: string;
};

export function logCheckInSync(event: CheckInSyncLogEvent): void {
  console.log('[CheckInSync]', JSON.stringify({ ...event, ts: new Date().toISOString() }));
}
