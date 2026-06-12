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

type Lang = 'es' | 'en';

const RANGE_LABELS: Record<Lang, Record<string, string>> = {
  en: { today: 'today', tomorrow: 'tomorrow', this_week: 'this week', next_week: 'next week' },
  es: { today: 'hoy', tomorrow: 'mañana', this_week: 'esta semana', next_week: 'la próxima semana' },
};

export function resolveDateRange(
  range: CalendarRange,
  startDate?: string,
  endDate?: string,
  lang: Lang = 'en',
): DateRange {
  const now = companyNow();
  const label = (key: string) => RANGE_LABELS[lang][key];
  switch (range) {
    case 'today':
      return { start: now.startOf('day'), end: now.endOf('day'), label: label('today') };
    case 'tomorrow': {
      const t = now.plus({ days: 1 });
      return { start: t.startOf('day'), end: t.endOf('day'), label: label('tomorrow') };
    }
    case 'this_week':
      return { start: now.startOf('week'), end: now.endOf('week'), label: label('this_week') };
    case 'next_week': {
      const n = now.plus({ weeks: 1 });
      return { start: n.startOf('week'), end: n.endOf('week'), label: label('next_week') };
    }
    case 'custom': {
      const start = startDate
        ? DateTime.fromISO(startDate, { zone: env.COMPANY_TIMEZONE }).startOf('day')
        : now.startOf('day');
      const end = endDate
        ? DateTime.fromISO(endDate, { zone: env.COMPANY_TIMEZONE }).endOf('day')
        : start.endOf('day');
      const fmt = (d: DateTime) => d.setLocale(lang).toFormat(lang === 'es' ? 'd LLL' : 'LLL d');
      return {
        start,
        end,
        label:
          lang === 'es'
            ? `del ${fmt(start)} al ${fmt(end)}`
            : `from ${fmt(start)} to ${fmt(end)}`,
      };
    }
  }
}

/** "Jun 10, 2026" / "10 jun 2026" in company timezone, from an ISO string or Date. */
export function formatDate(value: string | Date, lang: Lang = 'en'): string {
  const dt =
    typeof value === 'string'
      ? DateTime.fromISO(value, { setZone: true })
      : DateTime.fromJSDate(value);
  return dt
    .setZone(env.COMPANY_TIMEZONE)
    .setLocale(lang)
    .toFormat(lang === 'es' ? 'd LLL yyyy' : 'LLL d, yyyy');
}

/** "Mon, Jun 15 — 9:00 AM" / "lun, 15 jun — 9:00 AM" in company timezone. */
export function formatEventStart(event: CalendarEventItem, lang: Lang = 'en'): string {
  const dt = DateTime.fromISO(event.start, { setZone: true })
    .setZone(env.COMPANY_TIMEZONE)
    .setLocale(lang);
  const day = dt.toFormat(lang === 'es' ? 'EEE, d LLL' : 'EEE, LLL d');
  if (event.allDay) {
    return `${day} — ${lang === 'es' ? 'Todo el día' : 'All day'}`;
  }
  return `${day} — ${dt.toFormat('h:mm a')}`;
}

/** Whether a JS Date falls inside a luxon range (used for ClickUp due dates). */
export function isWithinRange(date: Date, range: DateRange): boolean {
  const ms = date.getTime();
  return ms >= range.start.toMillis() && ms <= range.end.toMillis();
}
