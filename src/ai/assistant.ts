import { callModel, matchInfoReply, routeIntent, type Lang } from './intentRouter';
import { chatSystemPrompt, type ChatUserContext } from './prompts';
import { listConnections } from '../services/connectionService';
import { searchDriveFiles } from '../tools/googleDrive';
import { getCalendarEvents } from '../tools/googleCalendar';
import { getMyClickUpTasks, searchClickUpTasks } from '../tools/clickup';
import { getOrCreateUser, type SlackProfile } from '../services/userService';
import { logAudit } from '../services/auditService';
import {
  addTicketAttachments,
  attachInfoReply,
  createTicket,
  listTicketsAwaitingInfo,
  listUserTickets,
} from '../services/ticketService';
import { stashPendingFiles, takePendingFiles } from '../services/attachmentStore';
import { stashInfoReply, takeInfoReply } from '../services/infoReplyStore';
import { prisma } from '../db/prisma';
import {
  NotConnectedError,
  RateLimitError,
  ReconnectRequiredError,
  type SlackImageFile,
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
  files: SlackImageFile[] = [],
): Promise<string> {
  const user = await getOrCreateUser(slackUserId, slackTeamId, profile);

  // Screenshot with no text: keep it on hand for the ticket and ask for details.
  if (!text && files.length > 0) {
    stashPendingFiles(user.id, files);
    const reply = t('es').screenshotReceived;
    await saveChatMessage(user.id, source, '[pantallazo adjunto]', reply, 'screenshot');
    return reply;
  }

  const storedText =
    files.length > 0 ? `${text} [+${files.length} pantallazo(s) adjunto(s)]` : text;

  // If the support team asked this user for more info on a ticket, try to
  // route this message back to that ticket before the normal intent flow.
  const infoReply = await maybeCaptureInfoReply(user.id, text, files);
  if (infoReply) {
    await saveChatMessage(user.id, source, storedText, infoReply, 'ticket_info');
    return infoReply;
  }

  const intent = await routeIntent(text);
  const reply = await executeIntent(user, intent, text, files);
  await saveChatMessage(user.id, source, storedText, reply, intent.intent);
  return reply;
}

/**
 * Routes a message that answers a pending "we need more info" ticket request
 * back to its ticket. Returns the reply to send, or null when the message is
 * unrelated (normal intent routing takes over). With several pending tickets
 * and no clear match, it asks the user which ticket the answer is for and
 * stashes the text until they say the number.
 */
async function maybeCaptureInfoReply(
  userId: string,
  text: string,
  files: SlackImageFile[],
): Promise<string | null> {
  const pendingTickets = await listTicketsAwaitingInfo(userId);
  if (pendingTickets.length === 0) return null;

  const match = await matchInfoReply(text, pendingTickets);

  if (match.verdict === 'unrelated') return null;

  if (match.verdict === 'answer') {
    const ticket = pendingTickets.find((tk) => tk.number === match.ticketNumber);
    if (!ticket) return null;
    const lang: Lang = ticket.lang === 'en' ? 'en' : 'es';
    // A stashed earlier answer (from the "which ticket?" round trip) rides along.
    const stashed = takeInfoReply(userId);
    const fullText = stashed?.text ? `${stashed.text}\n${text}` : text;
    const allFiles = [...(stashed?.files ?? []), ...files].filter(
      (f, i, arr) => arr.findIndex((o) => o.slackFileId === f.slackFileId) === i,
    );
    const result = await attachInfoReply(ticket.id, fullText, allFiles);
    if (!result) return null;
    await logAudit({
      userId,
      action: 'ticket.info_reply',
      query: `#${ticket.number}${result.attached ? ` [+${result.attached} adjuntos]` : ''}`,
      status: 'success',
    });
    return lang === 'es'
      ? `📎 ¡Gracias! Agregué tu respuesta al ticket *#${ticket.number}* — _${ticket.title}_.${
          result.attached > 0 ? ` También adjunté ${result.attached} pantallazo(s).` : ''
        } El equipo la revisará y te aviso por aquí cuando haya novedades. 🙌`
      : `📎 Thanks! I added your reply to ticket *#${ticket.number}* — _${ticket.title}_.${
          result.attached > 0 ? ` I also attached ${result.attached} screenshot(s).` : ''
        } The team will review it and I will keep you posted here. 🙌`;
  }

  // Ambiguous: keep the answer on hand and ask which ticket it belongs to.
  stashInfoReply(userId, text, files);
  const lang: Lang = pendingTickets.some((tk) => tk.lang === 'en') ? 'en' : 'es';
  const options = pendingTickets.map((tk) => `• *#${tk.number}* — _${tk.title}_`).join('\n');
  await logAudit({ userId, action: 'ticket.info_reply', query: 'ambiguous', status: 'empty' });
  return lang === 'es'
    ? `Tengo tu respuesta 🙌 pero te pedimos información de varios tickets y quiero guardarla en el correcto:\n${options}\n¿A cuál corresponde? Respóndeme con el número (por ejemplo *#${pendingTickets[0].number}*).`
    : `Got your reply 🙌 but we asked for information on more than one ticket and I want to file it under the right one:\n${options}\nWhich one is it for? Reply with the number (e.g. *#${pendingTickets[0].number}*).`;
}

async function executeIntent(
  user: { id: string; name: string | null },
  intent: Awaited<ReturnType<typeof routeIntent>>,
  text: string,
  files: SlackImageFile[] = [],
): Promise<string> {
  const lang = intent.lang;

  // Screenshots that don't land on a ticket this turn stay available for the
  // next 30 minutes, so "aquí va el pantallazo" + description in two messages
  // still ends up attached.
  if (files.length > 0 && intent.intent !== 'open_ticket') {
    stashPendingFiles(user.id, files);
  }

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
          stashPendingFiles(user.id, files);
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
        const allFiles = [...files, ...takePendingFiles(user.id)].filter(
          (f, i, arr) => arr.findIndex((o) => o.slackFileId === f.slackFileId) === i,
        );
        const attached = await addTicketAttachments(ticket.id, allFiles);
        await logAudit({
          userId: user.id,
          action: 'ticket.open',
          query: `#${ticket.number} ${intent.category}/${intent.priority}: ${intent.title}${attached ? ` [+${attached} adjuntos]` : ''}`,
          status: 'success',
        });
        const reply = formatTicketOpened(ticket, lang);
        return attached > 0 ? `${reply}\n${t(lang).ticketAttachments(attached)}` : reply;
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
