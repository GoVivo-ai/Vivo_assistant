import { DateTime } from 'luxon';
import { env } from '../config/env';
import type { CalendarEventItem, CalendarRange } from '../types';

export function companyNow(): DateTime {
  return DateTime.now().setZone(env.COMPANY_TIMEZONE);
}

export interface DateRange {
  start: DateTime;
  end: DateTime;
  label: string;
}

export function resolveDateRange(
  range: CalendarRange,
  startDate?: string,
  endDate?: string,
): DateRange {
  const now = companyNow();
  switch (range) {
    case 'today':
      return { start: now.startOf('day'), end: now.endOf('day'), label: 'today' };
    case 'tomorrow': {
      const t = now.plus({ days: 1 });
      return { start: t.startOf('day'), end: t.endOf('day'), label: 'tomorrow' };
    }
    case 'this_week':
      return { start: now.startOf('week'), end: now.endOf('week'), label: 'this week' };
    case 'next_week': {
      const n = now.plus({ weeks: 1 });
      return { start: n.startOf('week'), end: n.endOf('week'), label: 'next week' };
    }
    case 'custom': {
      const start = startDate
        ? DateTime.fromISO(startDate, { zone: env.COMPANY_TIMEZONE }).startOf('day')
        : now.startOf('day');
      const end = endDate
        ? DateTime.fromISO(endDate, { zone: env.COMPANY_TIMEZONE }).endOf('day')
        : start.endOf('day');
      return {
        start,
        end,
        label: `from ${start.toFormat('LLL d')} to ${end.toFormat('LLL d')}`,
      };
    }
  }
}

/** "Jun 10, 2026" in company timezone, from an ISO string or Date. */
export function formatDate(value: string | Date): string {
  const dt =
    typeof value === 'string'
      ? DateTime.fromISO(value, { setZone: true })
      : DateTime.fromJSDate(value);
  return dt.setZone(env.COMPANY_TIMEZONE).toFormat('LLL d, yyyy');
}

/** "Mon, Jun 15 — 9:00 AM" (or "Mon, Jun 15 — All day") in company timezone. */
export function formatEventStart(event: CalendarEventItem): string {
  const dt = DateTime.fromISO(event.start, { setZone: true }).setZone(env.COMPANY_TIMEZONE);
  if (event.allDay) {
    return `${dt.toFormat('EEE, LLL d')} — All day`;
  }
  return `${dt.toFormat('EEE, LLL d')} — ${dt.toFormat('h:mm a')}`;
}

/** Whether a JS Date falls inside a luxon range (used for ClickUp due dates). */
export function isWithinRange(date: Date, range: DateRange): boolean {
  const ms = date.getTime();
  return ms >= range.start.toMillis() && ms <= range.end.toMillis();
}
