import { callModel, routeIntent, type Lang } from './intentRouter';
import { chatSystemPrompt } from './prompts';
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
  connectPrompt,
  formatCalendarResults,
  formatClickUpTasks,
  formatDriveResults,
  helpText,
  reconnectPrompt,
  t,
} from '../utils/formatters';

async function generateChatReply(text: string, lang: Lang): Promise<string> {
  try {
    const reply = (await callModel(chatSystemPrompt(lang), text, { maxTokens: 200 })).trim();
    return reply.length > 0 ? reply : t(lang).unknown;
  } catch (err) {
    console.error('[assistant] chat reply failed:', (err as Error).message);
    return t(lang).unknown;
  }
}

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
  const lang = intent.lang;

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
        return formatDriveResults(items, lang);
      }

      case 'calendar_events': {
        const { events, rangeLabel } = await getCalendarEvents(
          user.id,
          intent.range,
          intent.startDate,
          intent.endDate,
          lang,
        );
        await logAudit({
          userId: user.id,
          action: 'calendar.events',
          provider: 'google',
          query: intent.range,
          status: events.length > 0 ? 'success' : 'empty',
        });
        return formatCalendarResults(events, rangeLabel, lang);
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
        const intro = tasks.length === 1 ? t(lang).foundTask : t(lang).foundTasks;
        return formatClickUpTasks(tasks, intro, lang);
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
        const intro =
          intent.status === 'overdue'
            ? t(lang).overdueTasks
            : intent.status === 'in_progress'
              ? t(lang).inProgressTasks
              : t(lang).yourTasks;
        return formatClickUpTasks(tasks, intro, lang);
      }

      case 'help':
        return helpText(lang);

      case 'chat':
        return generateChatReply(text, lang);

      case 'unknown':
        return t(lang).unknown;
    }
  } catch (err) {
    if (err instanceof NotConnectedError) {
      await logAudit({
        userId: user.id,
        action: intent.intent,
        provider: err.provider,
        status: 'not_connected',
      });
      return connectPrompt(err.provider, lang);
    }
    if (err instanceof ReconnectRequiredError) {
      await logAudit({
        userId: user.id,
        action: intent.intent,
        provider: err.provider,
        status: 'error',
      });
      return reconnectPrompt(err.provider, lang);
    }
    if (err instanceof RateLimitError) {
      return t(lang).rateLimit;
    }
    // Never log raw error objects that could contain tokens or payloads.
    console.error(`[assistant] tool call failed for intent ${intent.intent}:`, (err as Error).message);
    await logAudit({ userId: user.id, action: intent.intent, status: 'error' });
    return t(lang).genericError;
  }
}
