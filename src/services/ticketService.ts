import { WebClient } from '@slack/web-api';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import type { SlackImageFile } from '../types';

export type TicketCategory =
  | 'access'
  | 'bug'
  | 'data'
  | 'performance'
  | 'integration'
  | 'feature_request'
  | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 4000;

export async function createTicket(input: {
  userId: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  lang: 'es' | 'en';
}) {
  return prisma.ticket.create({
    data: {
      userId: input.userId,
      title: input.title.slice(0, MAX_TITLE),
      description: input.description.slice(0, MAX_DESCRIPTION),
      category: input.category,
      priority: input.priority,
      lang: input.lang,
    },
  });
}

/** Tickets the user would ask about in chat: anything not closed, plus recently resolved. */
export async function listUserTickets(userId: string, take = 5) {
  return prisma.ticket.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }],
    take,
  });
}

export async function listTickets(status?: TicketStatus) {
  return prisma.ticket.findMany({
    where: status ? { status } : undefined,
    include: { user: { select: { id: true, name: true, email: true, slackUserId: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function countTicketsByStatus(): Promise<Record<TicketStatus, number>> {
  const groups = await prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } });
  const counts: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const g of groups) {
    if (g.status in counts) counts[g.status as TicketStatus] = g._count._all;
  }
  return counts;
}

export async function getTicket(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, slackUserId: true } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/** Links Slack screenshots to a ticket. Best-effort: never fails the ticket. */
export async function addTicketAttachments(
  ticketId: string,
  files: SlackImageFile[],
): Promise<number> {
  if (files.length === 0) return 0;
  try {
    const result = await prisma.ticketAttachment.createMany({
      data: files.map((f) => ({
        ticketId,
        slackFileId: f.slackFileId,
        name: f.name,
        mimetype: f.mimetype,
        urlPrivate: f.urlPrivate,
        size: f.size,
      })),
    });
    return result.count;
  } catch (err) {
    console.error('[tickets] failed to store attachments:', (err as Error).message);
    return 0;
  }
}

export async function getTicketAttachment(id: string) {
  return prisma.ticketAttachment.findUnique({ where: { id } });
}

export interface TicketUpdateInput {
  status: TicketStatus;
  priority: TicketPriority;
  adminNote?: string;
  resolutionNote?: string;
  /** When true and the status is in_progress, DM the user that their case is being worked on. */
  notifyInProgress?: boolean;
  /** Optional extra detail included in the in-progress DM. */
  progressNote?: string;
}

/**
 * Applies an admin update. When the ticket transitions into "resolved", the
 * user who opened it gets a Slack DM with the resolution note (best-effort:
 * a DM failure never loses the status change; notifiedAt stays null).
 */
export async function updateTicket(id: string, input: TicketUpdateInput) {
  const before = await getTicket(id);
  if (!before) return null;

  const becameResolved = input.status === 'resolved' && before.status !== 'resolved';
  // Also covers the retry case: ticket already resolved but the DM failed —
  // saving again re-attempts the notification.
  const shouldNotify = input.status === 'resolved' && !before.notifiedAt;
  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      status: input.status,
      priority: input.priority,
      adminNote: input.adminNote?.trim() || null,
      resolutionNote: input.resolutionNote?.trim() || null,
      ...(becameResolved ? { resolvedAt: new Date() } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true, slackUserId: true } } },
  });

  let progressNotified = false;
  if (input.status === 'in_progress' && input.notifyInProgress) {
    progressNotified = await notifyTicketInProgress(
      ticket.user.slackUserId,
      ticket.number,
      ticket.title,
      input.progressNote,
      ticket.lang === 'en' ? 'en' : 'es',
    );
  }

  if (shouldNotify) {
    const notified = await notifyTicketResolved(
      ticket.user.slackUserId,
      ticket.number,
      ticket.title,
      ticket.resolutionNote,
      ticket.lang === 'en' ? 'en' : 'es',
    );
    if (notified) {
      const refreshed = await prisma.ticket.update({
        where: { id },
        data: { notifiedAt: new Date() },
        include: { user: { select: { id: true, name: true, email: true, slackUserId: true } } },
      });
      return { ...refreshed, progressNotified };
    }
  }
  return { ...ticket, progressNotified };
}

/**
 * DMs the ticket owner asking for more details about their case. The reply
 * lands in their normal chat with Vivo, visible under /admin/chat/:userId.
 * Returns true on success.
 */
export async function requestTicketInfo(id: string, question?: string): Promise<boolean> {
  const ticket = await getTicket(id);
  if (!ticket) return false;
  const ask = question?.trim();
  const lang = ticket.lang === 'en' ? 'en' : 'es';
  const text =
    lang === 'es'
      ? [
          `🔎 Sobre tu ticket *#${ticket.number}* — _${ticket.title}_ — necesitamos un poco más de información para poder ayudarte.`,
          ask
            ? `\n${ask}`
            : '\n¿Puedes contarme más detalles? Por ejemplo: qué estabas haciendo cuando ocurrió, qué mensaje de error viste, y desde cuándo pasa. Si tienes pantallazos, envíamelos por aquí.',
          '\nRespóndeme por este chat y agrego la información a tu caso. 🙌',
        ].join('')
      : [
          `🔎 About your ticket *#${ticket.number}* — _${ticket.title}_ — we need a bit more information to help you.`,
          ask
            ? `\n${ask}`
            : '\nCould you share more details? For example: what you were doing when it happened, any error message you saw, and since when. Screenshots are welcome too.',
          '\nReply here and I will add the information to your case. 🙌',
        ].join('');
  try {
    await dmUser(ticket.user.slackUserId, text);
    // Mark the pending request so the assistant can route the user's next
    // reply back to this ticket (see attachInfoReply / listTicketsAwaitingInfo).
    await prisma.ticket.update({
      where: { id },
      data: { infoRequestedAt: new Date(), infoQuestion: ask ?? null },
    });
    return true;
  } catch (err) {
    console.error('[tickets] failed to request more info:', (err as Error).message);
    return false;
  }
}

/** Open/in-progress tickets of this user with an unanswered info request. */
export async function listTicketsAwaitingInfo(userId: string) {
  return prisma.ticket.findMany({
    where: {
      userId,
      infoRequestedAt: { not: null },
      status: { in: ['open', 'in_progress'] },
    },
    orderBy: { infoRequestedAt: 'desc' },
  });
}

/**
 * Attaches the user's reply to the ticket it answers: appends it to the
 * description (visible in the admin panel and over MCP), stores any
 * screenshots, and clears the pending-info flag.
 */
export async function attachInfoReply(
  ticketId: string,
  reply: string,
  files: SlackImageFile[] = [],
): Promise<{ number: number; attached: number } | null> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return null;
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const addition = `\n\n— Respuesta del usuario (${stamp} UTC) —\n${reply.trim()}`;
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      description: (ticket.description + addition).slice(0, MAX_DESCRIPTION),
      infoRequestedAt: null,
      infoQuestion: null,
    },
  });
  const attached = await addTicketAttachments(ticketId, files);
  return { number: ticket.number, attached };
}

/** DMs the ticket owner that their ticket is being worked on. Returns true on success. */
async function notifyTicketInProgress(
  slackUserId: string,
  number: number,
  title: string,
  progressNote: string | undefined,
  lang: 'es' | 'en',
): Promise<boolean> {
  const note = progressNote?.trim();
  const text =
    lang === 'es'
      ? [
          `🔧 Tu ticket *#${number}* — _${title}_ — está ahora *en proceso*. Nuestro equipo ya está trabajando en tu caso.`,
          note ? `\n*Avance:* ${note}` : '',
          '\nTe avisaré por aquí en cuanto esté solucionado. 🙌',
        ].join('')
      : [
          `🔧 Your ticket *#${number}* — _${title}_ — is now *in progress*. Our team is working on your case.`,
          note ? `\n*Update:* ${note}` : '',
          '\nI will let you know here as soon as it is resolved. 🙌',
        ].join('');
  try {
    await dmUser(slackUserId, text);
    return true;
  } catch (err) {
    console.error('[tickets] failed to notify user of progress:', (err as Error).message);
    return false;
  }
}

/** Sends a DM to a Slack user, opening the conversation if needed. */
async function dmUser(slackUserId: string, text: string): Promise<void> {
  const client = new WebClient(env.SLACK_BOT_TOKEN);
  try {
    // Posting straight to the user id reuses the existing DM and only
    // needs chat:write. Fallback below needs the im:write scope.
    await client.chat.postMessage({ channel: slackUserId, text });
  } catch {
    const dm = await client.conversations.open({ users: slackUserId });
    if (!dm.channel?.id) throw new Error('could not open DM channel');
    await client.chat.postMessage({ channel: dm.channel.id, text });
  }
  await recordTicketDm(slackUserId, text);
}

/**
 * Mirrors an outbound ticket DM into the user's chat history so it shows up
 * in the admin "Conversaciones" view — otherwise these messages only exist
 * in Slack. Best-effort: a logging failure must not fail the notification.
 */
async function recordTicketDm(slackUserId: string, text: string): Promise<void> {
  try {
    const user = await prisma.user.findFirst({ where: { slackUserId }, select: { id: true } });
    if (!user) return;
    await prisma.chatMessage.create({
      data: { userId: user.id, source: 'ticket', userText: '', botReply: text, intent: 'ticket' },
    });
  } catch (err) {
    console.error('[tickets] failed to record ticket DM in chat history:', (err as Error).message);
  }
}

/** DMs the ticket owner that their ticket was resolved. Returns true on success. */
async function notifyTicketResolved(
  slackUserId: string,
  number: number,
  title: string,
  resolutionNote: string | null,
  lang: 'es' | 'en',
): Promise<boolean> {
  const note = resolutionNote?.trim();
  const text =
    lang === 'es'
      ? [
          `✅ ¡Buenas noticias! Tu ticket *#${number}* — _${title}_ — ya fue *solucionado*.`,
          note ? `\n*Detalle de la solución:* ${note}` : '',
          '\nSi el problema persiste, cuéntamelo y abro un nuevo ticket. 🙌',
        ].join('')
      : [
          `✅ Good news! Your ticket *#${number}* — _${title}_ — has been *resolved*.`,
          note ? `\n*Resolution details:* ${note}` : '',
          '\nIf the problem comes back, just tell me and I will open a new ticket. 🙌',
        ].join('');
  try {
    await dmUser(slackUserId, text);
    return true;
  } catch (err) {
    console.error('[tickets] failed to notify user of resolution:', (err as Error).message);
    return false;
  }
}
