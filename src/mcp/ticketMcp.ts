import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import {
  countTicketsByStatus,
  getTicket,
  listTickets,
  requestTicketInfo,
  updateTicket,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from '../services/ticketService';

const statusEnum = z.enum(TICKET_STATUSES as [TicketStatus, ...TicketStatus[]]);
const priorityEnum = z.enum(TICKET_PRIORITIES as [TicketPriority, ...TicketPriority[]]);

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * MCP server exposing the same ticket management surface as the /admin panel,
 * so an external agent (e.g. Claude Code) can triage tickets. Mutating tools
 * reuse ticketService and therefore send the same Slack DMs the panel sends.
 */
export function buildTicketMcpServer(): McpServer {
  const server = new McpServer({ name: 'vivo-tickets', version: '1.0.0' });

  server.registerTool(
    'ticket_stats',
    {
      title: 'Ticket counts by status',
      description: 'Returns how many tickets exist per status (open, in_progress, resolved, closed).',
      inputSchema: {},
    },
    async () => json(await countTicketsByStatus()),
  );

  server.registerTool(
    'list_tickets',
    {
      title: 'List tickets',
      description:
        'Lists tickets (newest first, up to 200), optionally filtered by status. Returns id, number, title, status, priority, category, reporter and dates.',
      inputSchema: { status: statusEnum.optional() },
    },
    async ({ status }) => {
      const tickets = await listTickets(status);
      return json(
        tickets.map((t) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          status: t.status,
          priority: t.priority,
          category: t.category,
          lang: t.lang,
          reporter: { name: t.user.name, email: t.user.email },
          createdAt: t.createdAt,
          resolvedAt: t.resolvedAt,
        })),
      );
    },
  );

  server.registerTool(
    'get_ticket',
    {
      title: 'Get ticket details',
      description:
        'Full detail of one ticket by id: description, notes, attachments metadata, reporter and notification state.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const t = await getTicket(id);
      if (!t) return json({ error: 'Ticket not found' });
      return json({
        id: t.id,
        number: t.number,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        category: t.category,
        lang: t.lang,
        adminNote: t.adminNote,
        resolutionNote: t.resolutionNote,
        reporter: { name: t.user.name, email: t.user.email, slackUserId: t.user.slackUserId },
        attachments: t.attachments.map((a) => ({ id: a.id, name: a.name, mimetype: a.mimetype })),
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        userNotifiedAt: t.notifiedAt,
      });
    },
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update a ticket',
      description:
        'Updates status/priority/notes of a ticket. Setting status to "resolved" DMs the reporter with the resolutionNote (write it in the ticket lang). With notifyInProgress=true and status "in_progress", the reporter gets a "we are working on it" DM including the optional progressNote. Omitted fields keep their current value.',
      inputSchema: {
        id: z.string(),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        adminNote: z.string().optional().describe('Internal note, never sent to the user'),
        resolutionNote: z.string().optional().describe('Sent to the user when resolving'),
        notifyInProgress: z.boolean().optional(),
        progressNote: z.string().optional().describe('Extra detail for the in-progress DM'),
      },
    },
    async ({ id, status, priority, adminNote, resolutionNote, notifyInProgress, progressNote }) => {
      const before = await getTicket(id);
      if (!before) return json({ error: 'Ticket not found' });
      const updated = await updateTicket(id, {
        status: status ?? (before.status as TicketStatus),
        priority: priority ?? (before.priority as TicketPriority),
        adminNote: adminNote ?? before.adminNote ?? undefined,
        resolutionNote: resolutionNote ?? before.resolutionNote ?? undefined,
        notifyInProgress,
        progressNote,
      });
      if (!updated) return json({ error: 'Ticket not found' });
      return json({
        ok: true,
        number: updated.number,
        status: updated.status,
        priority: updated.priority,
        userNotifiedOfResolution: Boolean(updated.notifiedAt),
        userNotifiedOfProgress: updated.progressNotified,
      });
    },
  );

  server.registerTool(
    'request_ticket_info',
    {
      title: 'Ask the reporter for more details',
      description:
        'DMs the ticket reporter asking for more information. Pass a specific question (in the ticket lang) or omit it for a generic ask. Their reply is automatically appended to the ticket description (with any screenshots attached); check the ticket again later.',
      inputSchema: {
        id: z.string(),
        question: z.string().optional(),
      },
    },
    async ({ id, question }) => {
      const sent = await requestTicketInfo(id, question);
      return json({ ok: sent, ...(sent ? {} : { error: 'DM could not be sent' }) });
    },
  );

  return server;
}
