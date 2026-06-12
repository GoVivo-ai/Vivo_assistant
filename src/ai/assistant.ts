import { routeIntent } from './intentRouter';
import { searchDriveFiles } from '../tools/googleDrive';
import { getCalendarEvents } from '../tools/googleCalendar';
import { getMyClickUpTasks, searchClickUpTasks } from '../tools/clickup';
import { getOrCreateUser, type SlackProfile } from '../services/userService';
import { logAudit } from '../services/auditService';
import {
  NotConnectedError,
  RateLimitError,
  ReconnectRequiredError,
} from '../types';
import {
  GENERIC_ERROR_TEXT,
  HELP_TEXT,
  UNKNOWN_TEXT,
  connectPrompt,
  formatCalendarResults,
  formatClickUpTasks,
  formatDriveResults,
  reconnectPrompt,
} from '../utils/formatters';

/**
 * Core assistant flow. SECURITY INVARIANT: every tool call below receives the
 * internal id of the Slack user who sent the message, and each tool resolves
 * ONLY that user's own OAuth tokens. No global/shared credentials exist.
 */
export async function handleAssistantQuery(
  slackUserId: string,
  slackTeamId: string,
  text: string,
  profile?: SlackProfile,
): Promise<string> {
  const user = await getOrCreateUser(slackUserId, slackTeamId, profile);
  const intent = await routeIntent(text);

  try {
    switch (intent.intent) {
      case 'search_drive': {
        const items = await searchDriveFiles(user.id, intent.query, intent.type);
        await logAudit({
          userId: user.id,
          action: 'drive.search',
          provider: 'google',
          query: intent.query,
          status: items.length > 0 ? 'success' : 'empty',
        });
        return formatDriveResults(items);
      }

      case 'calendar_events': {
        const { events, rangeLabel } = await getCalendarEvents(
          user.id,
          intent.range,
          intent.startDate,
          intent.endDate,
        );
        await logAudit({
          userId: user.id,
          action: 'calendar.events',
          provider: 'google',
          query: intent.range,
          status: events.length > 0 ? 'success' : 'empty',
        });
        return formatCalendarResults(events, rangeLabel);
      }

      case 'clickup_task_status': {
        const tasks = await searchClickUpTasks(user.id, intent.query);
        await logAudit({
          userId: user.id,
          action: 'clickup.search',
          provider: 'clickup',
          query: intent.query,
          status: tasks.length > 0 ? 'success' : 'empty',
        });
        const intro = tasks.length === 1 ? 'I found this task:' : 'I found these tasks:';
        return formatClickUpTasks(tasks, intro);
      }

      case 'clickup_my_tasks': {
        const tasks = await getMyClickUpTasks(user.id, intent.status, intent.range);
        await logAudit({
          userId: user.id,
          action: 'clickup.my_tasks',
          provider: 'clickup',
          query: `${intent.status}/${intent.range}`,
          status: tasks.length > 0 ? 'success' : 'empty',
        });
        const label =
          intent.status === 'overdue'
            ? 'Your overdue tasks:'
            : intent.status === 'in_progress'
              ? 'Your tasks in progress:'
              : 'Your tasks:';
        return formatClickUpTasks(tasks, label);
      }

      case 'help':
        return HELP_TEXT;

      case 'unknown':
        return UNKNOWN_TEXT;
    }
  } catch (err) {
    if (err instanceof NotConnectedError) {
      await logAudit({
        userId: user.id,
        action: `${intent.intent}`,
        provider: err.provider,
        status: 'not_connected',
      });
      return connectPrompt(err.provider);
    }
    if (err instanceof ReconnectRequiredError) {
      await logAudit({
        userId: user.id,
        action: `${intent.intent}`,
        provider: err.provider,
        status: 'error',
      });
      return reconnectPrompt(err.provider);
    }
    if (err instanceof RateLimitError) {
      return 'That service is rate-limiting requests right now. Please try again in a minute.';
    }
    // Never log raw error objects that could contain tokens or payloads.
    console.error(`[assistant] tool call failed for intent ${intent.intent}:`, (err as Error).message);
    await logAudit({ userId: user.id, action: intent.intent, status: 'error' });
    return GENERIC_ERROR_TEXT;
  }
}
