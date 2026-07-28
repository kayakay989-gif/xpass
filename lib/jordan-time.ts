/**
 * Jordan (Asia/Amman) calendar and day-boundary helpers.
 * All subscription expiry, daily check-in limits, and pass deductions use these.
 */
export const JORDAN_TZ = 'Asia/Amman';

export function ammanDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: JORDAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Jordan local calendar day as YYYY-MM-DD. */
export function toAmmanDateString(date: Date): string {
  const p = ammanDateParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Add whole calendar days on YYYY-MM-DD strings (Jordan business calendar). */
export function addAmmanCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** UTC instant for 00:00:00 on a Jordan calendar day. */
export function startOfAmmanDay(input: Date | string): Date {
  const ymd = typeof input === 'string' ? input : toAmmanDateString(input);
  const [year, month, day] = ymd.split('-').map(Number);
  let t = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const p = ammanDateParts(new Date(t));
  t -= ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  const result = new Date(t);
  if (toAmmanDateString(result) !== ymd) {
    t += toAmmanDateString(new Date(t)) < ymd ? 3_600_000 : -3_600_000;
  }
  return new Date(t);
}

/** Last millisecond of a Jordan calendar day. */
export function endOfAmmanDay(input: Date | string): Date {
  const ymd = typeof input === 'string' ? input : toAmmanDateString(input);
  const nextStart = startOfAmmanDay(addAmmanCalendarDays(ymd, 1));
  return new Date(nextStart.getTime() - 1);
}

export function ammanDayKey(date: Date = new Date()): string {
  return toAmmanDateString(date);
}

export function ammanCalendarDaysBetween(fromYmd: string, toYmd: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toYmd) - parse(fromYmd)) / 86_400_000);
}

export function ammanCalendarDaysRemaining(endDate: Date, now: Date = new Date()): number {
  return Math.max(0, ammanCalendarDaysBetween(toAmmanDateString(now), toAmmanDateString(endDate)));
}

/** Subscription is expired after the Jordan calendar day of endDate ends. */
export function isExpiredInAmman(endDate: Date, now: Date = new Date()): boolean {
  return toAmmanDateString(now) > toAmmanDateString(endDate);
}

export function isSameAmmanCalendarDay(a: Date, b: Date): boolean {
  return toAmmanDateString(a) === toAmmanDateString(b);
}

/** Inclusive start, exclusive end — Jordan “today” window. */
export function getAmmanDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const ymd = toAmmanDateString(now);
  return {
    start: startOfAmmanDay(ymd),
    end: startOfAmmanDay(addAmmanCalendarDays(ymd, 1)),
  };
}

export function getPreviousAmmanDayStart(now: Date = new Date()): Date {
  return startOfAmmanDay(addAmmanCalendarDays(toAmmanDateString(now), -1));
}

/** End of the Jordan calendar day that is `durationMonths` after start (in Amman). */
export function computeSubscriptionEndDate(startDate: Date, durationMonths: number): Date {
  const [y, m, d] = toAmmanDateString(startDate).split('-').map(Number);
  let endMonth = m + durationMonths;
  let endYear = y;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const endDay = Math.min(d, lastDay);
  const endYmd = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  return endOfAmmanDay(endYmd);
}

export function formatDateAmman(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }
): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: JORDAN_TZ, ...options }).format(date);
}

export function ammanYearMonth(date: Date = new Date()): { year: number; month: number } {
  const p = ammanDateParts(date);
  return { year: p.year, month: p.month };
}

export function startOfAmmanMonth(year: number, month: number): Date {
  return startOfAmmanDay(`${year}-${String(month).padStart(2, '0')}-01`);
}

export function endOfAmmanMonth(year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return endOfAmmanDay(ymd);
}
