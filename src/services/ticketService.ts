import { WebClient } from '@slack/web-api';
import { prisma } from '../db/prisma';
import { env } from '../config/env';

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
    include: { user: { select: { id: true, name: true, email: true, slackUserId: true } } },
  });
}

export interface TicketUpdateInput {
  status: TicketStatus;
  priority: TicketPriority;
  adminNote?: string;
  resolutionNote?: string;
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

  if (shouldNotify) {
    const notified = await notifyTicketResolved(
      ticket.user.slackUserId,
      ticket.number,
      ticket.title,
      ticket.resolutionNote,
      ticket.lang === 'en' ? 'en' : 'es',
    );
    if (notified) {
      return prisma.ticket.update({
        where: { id },
        data: { notifiedAt: new Date() },
        include: { user: { select: { id: true, name: true, email: true, slackUserId: true } } },
      });
    }
  }
  return ticket;
}

/** DMs the ticket owner that their ticket was resolved. Returns true on success. */
async function notifyTicketResolved(
  slackUserId: string,
  number: number,
  title: string,
  resolutionNote: string | null,
  lang: 'es' | 'en',
): Promise<boolean> {
  try {
    const client = new WebClient(env.SLACK_BOT_TOKEN);
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
      // Posting straight to the user id reuses the existing DM and only
      // needs chat:write. Fallback below needs the im:write scope.
      await client.chat.postMessage({ channel: slackUserId, text });
    } catch {
      const dm = await client.conversations.open({ users: slackUserId });
      if (!dm.channel?.id) return false;
      await client.chat.postMessage({ channel: dm.channel.id, text });
    }
    return true;
  } catch (err) {
    console.error('[tickets] failed to notify user of resolution:', (err as Error).message);
    return false;
  }
}
