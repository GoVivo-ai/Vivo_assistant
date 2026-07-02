import { callModel, routeIntent, type Lang } from './intentRouter';
import { chatSystemPrompt, type ChatUserContext } from './prompts';
import { listConnections } from '../services/connectionService';
import { searchDriveFiles } from '../tools/googleDrive';
import { getCalendarEvents } from '../tools/googleCalendar';
import { getMyClickUpTasks, searchClickUpTasks } from '../tools/clickup';
import { getOrCreateUser, type SlackProfile } from '../services/userService';
import { logAudit } from '../services/auditService';
import { createTicket, listUserTickets } from '../services/ticketService';
import { prisma } from '../db/prisma';
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
  formatTicketList,
  formatTicketOpened,
  helpText,
  reconnectPrompt,
  t,
} from '../utils/formatters';

async function generateChatReply(
  text: string,
  lang: Lang,
  userContext?: ChatUserContext,
): Promise<string> {
  try {
    const reply = (
      await callModel(chatSystemPrompt(lang, userContext), text, { maxTokens: 200 })
    ).trim();
    return reply.length > 0 ? reply : t(lang).unknown;
  } catch (err) {
    console.error('[assistant] chat reply failed:', (err as Error).message);
    return t(lang).unknown;
  }
}

const MAX_STORED_TEXT = 4000;

/** Stores the full exchange for the /admin conversation view. Best-effort. */
async function saveChatMessage(
  userId: string,
  source: 'dm' | 'mention',
  userText: string,
  botReply: string,
  intent: string,
): Promise<void> {
  try {
    await prisma.chatMessage.create({
      data: {
        userId,
        source,
        userText: userText.slice(0, MAX_STORED_TEXT),
        botReply: botReply.slice(0, MAX_STORED_TEXT),
        intent,
      },
    });
  } catch (err) {
    console.error('[assistant] failed to store chat message:', (err as Error).message);
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
  source: 'dm' | 'mention' = 'dm',
): Promise<string> {
  const user = await getOrCreateUser(slackUserId, slackTeamId, profile);
  const intent = await routeIntent(text);
  const reply = await executeIntent(user, intent, text);
  await saveChatMessage(user.id, source, text, reply, intent.intent);
  return reply;
}

async function executeIntent(
  user: { id: string; name: string | null },
  intent: Awaited<ReturnType<typeof routeIntent>>,
  text: string,
): Promise<string> {
  const lang = intent.lang;

  try {
    switch (intent.intent) {
      case 'search_drive': {
        const isSearch = Boolean(intent.query && intent.query.trim().length > 0);
        const items = await searchDriveFiles(user.id, intent.query, intent.type);
        await logAudit({
          userId: user.id,
          action: isSearch ? 'drive.search' : 'drive.list',
          provider: 'google',
          query: intent.query ?? `list:${intent.type}`,
          status: items.length > 0 ? 'success' : 'empty',
        });
        return formatDriveResults(items, lang, isSearch);
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

      case 'open_ticket': {
        const title = intent.title?.trim();
        const description = intent.description?.trim();
        if (!title || !description) {
          await logAudit({ userId: user.id, action: 'ticket.prompt', query: text, status: 'success' });
          return t(lang).ticketAsk;
        }
        const ticket = await createTicket({
          userId: user.id,
          title,
          description,
          category: intent.category,
          priority: intent.priority,
          lang,
        });
        await logAudit({
          userId: user.id,
          action: 'ticket.open',
          query: `#${ticket.number} ${intent.category}/${intent.priority}: ${intent.title}`,
          status: 'success',
        });
        return formatTicketOpened(ticket, lang);
      }

      case 'ticket_status': {
        const tickets = await listUserTickets(user.id);
        await logAudit({
          userId: user.id,
          action: 'ticket.status',
          query: text,
          status: tickets.length > 0 ? 'success' : 'empty',
        });
        return formatTicketList(tickets, lang);
      }

      case 'help':
        await logAudit({ userId: user.id, action: 'help', query: text, status: 'success' });
        return helpText(lang);

      case 'chat': {
        const connections = await listConnections(user.id);
        const reply = await generateChatReply(text, lang, {
          name: user.name,
          googleConnected: connections.some((c) => c.provider === 'google'),
          clickupConnected: connections.some((c) => c.provider === 'clickup'),
        });
        await logAudit({ userId: user.id, action: 'chat', query: text, status: 'success' });
        return reply;
      }

      case 'unknown':
        await logAudit({ userId: user.id, action: 'unknown', query: text, status: 'empty' });
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
