import { google } from 'googleapis';
import { getGoogleAccessToken } from '../services/tokenService';
import { resolveDateRange } from '../utils/dates';
import type { CalendarEventItem, CalendarRange } from '../types';

const MAX_RESULTS = 10;

/**
 * Fetches events from the PRIMARY calendar of the requesting user only,
 * using that user's access token. Range is resolved in COMPANY_TIMEZONE.
 */
export async function getCalendarEvents(
  userId: string,
  range: CalendarRange,
  startDate?: string,
  endDate?: string,
): Promise<{ events: CalendarEventItem[]; rangeLabel: string }> {
  const accessToken = await getGoogleAccessToken(userId);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const dateRange = resolveDateRange(range, startDate, endDate);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: dateRange.start.toISO() ?? undefined,
    timeMax: dateRange.end.toISO() ?? undefined,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: MAX_RESULTS,
  });

  const events = (response.data.items ?? []).map((event): CalendarEventItem => {
    const allDay = Boolean(event.start?.date && !event.start?.dateTime);
    return {
      summary: event.summary ?? '(no title)',
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      allDay,
      location: event.location ?? undefined,
      htmlLink: event.htmlLink ?? undefined,
      attendees: event.attendees
        ?.map((attendee) => attendee.displayName ?? attendee.email ?? '')
        .filter(Boolean),
    };
  });

  return { events, rangeLabel: dateRange.label };
}
