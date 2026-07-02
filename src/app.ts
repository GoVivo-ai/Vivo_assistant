import crypto from 'node:crypto';
import express, { type Express, type IRouter, type Request, type Response } from 'express';
import { DateTime } from 'luxon';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { verifyState } from './security/encryption';
import { handleGoogleCallback } from './oauth/googleOAuth';
import { handleClickUpCallback } from './oauth/clickupOAuth';
import {
  countTicketsByStatus,
  getTicket,
  listTickets,
  updateTicket,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from './services/ticketService';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from './utils/formatters';

function page(title: string, message: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Vivo Assistant</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center;
             justify-content: center; min-height: 100vh; margin: 0; background: #f4f4f7; }
      .card { background: #fff; border-radius: 12px; padding: 40px 48px; max-width: 440px;
              box-shadow: 0 4px 16px rgba(0,0,0,.08); text-align: center; }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { color: #555; line-height: 1.5; margin: 0; }
    </style>
  </head>
  <body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}

const INVALID_STATE_PAGE = page(
  'Invalid or expired link',
  'This connection link is invalid or has expired. Please run /vivo-connect in Slack again.',
);

const ERROR_PAGE = page(
  'Connection failed',
  'We could not complete the connection. Please try again from Slack with /vivo-connect.',
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Basic Auth gate for the admin dashboard. Disabled entirely when no key is set. */
function requireAdmin(req: Request, res: Response): boolean {
  const key = env.ADMIN_DASHBOARD_KEY;
  if (!key) {
    res.status(404).send('Not found');
    return false;
  }
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Basic ')) {
    const provided = Buffer.from(header.slice(6), 'base64');
    const expected = Buffer.from(`admin:${key}`);
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  res
    .set('WWW-Authenticate', 'Basic realm="Vivo Assistant"')
    .status(401)
    .send('Authentication required');
  return false;
}

const ADMIN_CSS = `
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 860px; margin: 0 auto;
         padding: 32px 20px; background: #f4f4f7; color: #1a1d29; }
  h1 { font-size: 22px; } h2 { font-size: 16px; margin: 0 0 6px; }
  a { color: #4338ca; text-decoration: none; }
  section { background: #fff; border-radius: 12px; padding: 20px 24px; margin: 16px 0;
            box-shadow: 0 2px 8px rgba(0,0,0,.05); }
  .muted { color: #999; font-weight: 400; font-size: 12px; }
  .badge { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 99px;
           padding: 2px 10px; font-size: 12px; margin-right: 6px; }
  .badge.none { background: #f3f4f6; color: #9ca3af; }
  .userrow { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .chat { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .bubble { max-width: 75%; padding: 10px 14px; border-radius: 14px; font-size: 14px;
            line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { align-self: flex-end; background: #4338ca; color: #fff; border-bottom-right-radius: 4px; }
  .bubble.bot { align-self: flex-start; background: #ececf1; color: #1a1d29; border-bottom-left-radius: 4px; }
  .meta { font-size: 11px; color: #999; margin: 2px 6px; }
  .meta.user { align-self: flex-end; }
  .meta.bot { align-self: flex-start; }
  .chip { display: inline-block; background: #f1f1f4; border-radius: 6px; padding: 0 6px;
          font-family: monospace; font-size: 10px; color: #666; }
  nav.tabs { display: flex; gap: 8px; margin: 8px 0 4px; }
  nav.tabs a { padding: 6px 14px; border-radius: 8px; background: #fff; font-size: 14px;
               box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  nav.tabs a.active { background: #4338ca; color: #fff; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
  .stat { flex: 1; min-width: 120px; background: #fff; border-radius: 12px; padding: 14px 18px;
          box-shadow: 0 2px 8px rgba(0,0,0,.05); text-decoration: none; color: inherit; }
  .stat strong { font-size: 24px; display: block; }
  .stat.active { outline: 2px solid #4338ca; }
  table.tickets { width: 100%; border-collapse: collapse; font-size: 14px; }
  table.tickets th { text-align: left; font-size: 11px; text-transform: uppercase; color: #999;
                     padding: 8px 10px; border-bottom: 1px solid #eee; }
  table.tickets td { padding: 10px; border-bottom: 1px solid #f3f3f6; vertical-align: top; }
  table.tickets tr:hover td { background: #fafaff; }
  .pill { display: inline-block; border-radius: 99px; padding: 2px 10px; font-size: 12px;
          font-weight: 600; white-space: nowrap; }
  .pill.p-urgent { background: #fee2e2; color: #b91c1c; }
  .pill.p-high { background: #ffedd5; color: #c2410c; }
  .pill.p-medium { background: #fef9c3; color: #a16207; }
  .pill.p-low { background: #f3f4f6; color: #6b7280; }
  .pill.s-open { background: #dbeafe; color: #1d4ed8; }
  .pill.s-in_progress { background: #fef3c7; color: #b45309; }
  .pill.s-resolved { background: #dcfce7; color: #15803d; }
  .pill.s-closed { background: #e5e7eb; color: #4b5563; }
  .desc { background: #fafafc; border: 1px solid #eee; border-radius: 8px; padding: 14px 16px;
          white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
  form.ticket label { display: block; font-size: 12px; text-transform: uppercase; color: #999;
                      margin: 14px 0 4px; }
  form.ticket select, form.ticket textarea { width: 100%; box-sizing: border-box; font: inherit;
        padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
  form.ticket textarea { min-height: 70px; resize: vertical; }
  form.ticket button { margin-top: 16px; background: #4338ca; color: #fff; border: 0;
        border-radius: 8px; padding: 10px 22px; font: inherit; font-weight: 600; cursor: pointer; }
  form.ticket button:hover { background: #3730a3; }
  .hint { font-size: 12px; color: #999; margin-top: 4px; }
`;

function adminNav(active: 'chats' | 'tickets'): string {
  return `<nav class="tabs">
    <a href="/admin" class="${active === 'chats' ? 'active' : ''}">💬 Conversations</a>
    <a href="/admin/tickets" class="${active === 'tickets' ? 'active' : ''}">🎫 Tickets</a>
  </nav>`;
}

function adminPage(title: string, body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — Vivo Assistant</title>
    <style>${ADMIN_CSS}</style>
  </head>
  <body>${body}</body>
</html>`;
}

function fmtTs(d: Date): string {
  return DateTime.fromJSDate(d).setZone(env.COMPANY_TIMEZONE).toFormat('LLL d, h:mm a');
}

async function renderUserList(): Promise<string> {
  const users = await prisma.user.findMany({
    include: {
      connections: { select: { provider: true, providerEmail: true } },
      chatMessages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      _count: { select: { chatMessages: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const rows = users.map((user) => {
    const title = escapeHtml(user.name ?? user.slackUserId);
    const subtitle = escapeHtml(user.email ?? '');
    const badges =
      user.connections
        .map(
          (c) =>
            `<span class="badge">${c.provider}${c.providerEmail ? ` · ${escapeHtml(c.providerEmail)}` : ''}</span>`,
        )
        .join(' ') || '<span class="badge none">no connections</span>';
    const last = user.chatMessages[0]
      ? `last message ${fmtTs(user.chatMessages[0].createdAt)}`
      : 'no messages yet';
    return `<section class="userrow">
      <div>
        <h2><a href="/admin/chat/${user.id}">${title}</a> <small class="muted">${subtitle}</small></h2>
        <div>${badges}</div>
      </div>
      <div style="text-align:right">
        <div><strong>${user._count.chatMessages}</strong> <span class="muted">messages</span></div>
        <div class="muted">${last}</div>
        <a href="/admin/chat/${user.id}">View chat →</a>
      </div>
    </section>`;
  });

  return adminPage(
    'Users',
    `<h1>Vivo Assistant — Conversations</h1>
     ${adminNav('chats')}
     <p class="muted">Times shown in ${escapeHtml(env.COMPANY_TIMEZONE)}. Click a user to see their full chat with the assistant.</p>
     ${rows.join('\n') || '<section><p class="muted">No users yet.</p></section>'}`,
  );
}

async function renderUserChat(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      connections: { select: { provider: true } },
      chatMessages: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  });
  if (!user) return null;

  const messages = [...user.chatMessages].reverse();
  const bubbles = messages
    .map(
      (m) => `
      <div class="bubble user">${escapeHtml(m.userText)}</div>
      <div class="meta user">${fmtTs(m.createdAt)} · ${m.source}</div>
      <div class="bubble bot">${escapeHtml(m.botReply)}</div>
      <div class="meta bot"><span class="chip">${escapeHtml(m.intent ?? '?')}</span></div>`,
    )
    .join('\n');

  const title = escapeHtml(user.name ?? user.slackUserId);
  return adminPage(
    title,
    `<p><a href="/admin">← All users</a></p>
     <section>
       <h2>${title} <small class="muted">${escapeHtml(user.email ?? '')}</small></h2>
       <div>${user.connections.map((c) => `<span class="badge">${c.provider}</span>`).join(' ') || '<span class="badge none">no connections</span>'}</div>
       <div class="chat">${bubbles || '<p class="muted">No messages yet.</p>'}</div>
     </section>`,
  );
}

function pill(kind: 'p' | 's', value: string, label: string): string {
  return `<span class="pill ${kind}-${escapeHtml(value)}">${escapeHtml(label)}</span>`;
}

function categoryLabel(category: string): string {
  return TICKET_CATEGORY_LABELS[category as keyof typeof TICKET_CATEGORY_LABELS]?.es ?? category;
}

function priorityPill(priority: string): string {
  const label =
    TICKET_PRIORITY_LABELS[priority as keyof typeof TICKET_PRIORITY_LABELS]?.es ?? priority;
  return pill('p', priority, label);
}

function statusPill(status: string): string {
  const label = TICKET_STATUS_LABELS[status as keyof typeof TICKET_STATUS_LABELS]?.es ?? status;
  return pill('s', status, label);
}

async function renderTicketList(statusFilter?: TicketStatus): Promise<string> {
  const [tickets, counts] = await Promise.all([listTickets(statusFilter), countTicketsByStatus()]);
  const total = counts.open + counts.in_progress + counts.resolved + counts.closed;

  const stats = [
    { key: undefined, label: 'Todos', count: total },
    ...TICKET_STATUSES.map((s) => ({
      key: s,
      label: TICKET_STATUS_LABELS[s].es,
      count: counts[s],
    })),
  ]
    .map(
      (s) =>
        `<a class="stat ${statusFilter === s.key ? 'active' : ''}" href="/admin/tickets${s.key ? `?status=${s.key}` : ''}">
           <strong>${s.count}</strong> <span class="muted">${escapeHtml(s.label)}</span></a>`,
    )
    .join('\n');

  const rows = tickets
    .map(
      (ticket) => `<tr>
        <td><a href="/admin/tickets/${ticket.id}"><strong>#${ticket.number}</strong></a></td>
        <td><a href="/admin/tickets/${ticket.id}">${escapeHtml(ticket.title)}</a><br>
            <span class="muted">${escapeHtml(ticket.user.name ?? ticket.user.slackUserId)}</span></td>
        <td>${escapeHtml(categoryLabel(ticket.category))}</td>
        <td>${priorityPill(ticket.priority)}</td>
        <td>${statusPill(ticket.status)}</td>
        <td class="muted">${fmtTs(ticket.createdAt)}</td>
      </tr>`,
    )
    .join('\n');

  return adminPage(
    'Tickets',
    `<h1>Vivo Assistant — Tickets</h1>
     ${adminNav('tickets')}
     <div class="stats">${stats}</div>
     <section>
       ${
         tickets.length === 0
           ? '<p class="muted">No hay tickets en esta vista.</p>'
           : `<table class="tickets">
                <thead><tr><th>#</th><th>Ticket</th><th>Categoría</th><th>Prioridad</th><th>Estado</th><th>Creado</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`
       }
     </section>`,
  );
}

async function renderTicketDetail(id: string, flash?: string): Promise<string | null> {
  const ticket = await getTicket(id);
  if (!ticket) return null;

  const statusOptions = TICKET_STATUSES.map(
    (s) =>
      `<option value="${s}" ${ticket.status === s ? 'selected' : ''}>${TICKET_STATUS_LABELS[s].es}</option>`,
  ).join('');
  const priorityOptions = TICKET_PRIORITIES.map(
    (p) =>
      `<option value="${p}" ${ticket.priority === p ? 'selected' : ''}>${TICKET_PRIORITY_LABELS[p].es}</option>`,
  ).join('');

  const timeline = [
    `Abierto: ${fmtTs(ticket.createdAt)}`,
    ticket.resolvedAt ? `Solucionado: ${fmtTs(ticket.resolvedAt)}` : null,
    ticket.notifiedAt
      ? `Usuario notificado por Slack: ${fmtTs(ticket.notifiedAt)}`
      : ticket.status === 'resolved'
        ? '⚠️ El usuario aún NO ha sido notificado (el DM de Slack falló)'
        : null,
  ]
    .filter(Boolean)
    .map((l) => `<div class="muted">${escapeHtml(l as string)}</div>`)
    .join('\n');

  return adminPage(
    `Ticket #${ticket.number}`,
    `<p><a href="/admin/tickets">← Todos los tickets</a></p>
     ${flash ? `<section style="border-left:4px solid #15803d"><strong>${escapeHtml(flash)}</strong></section>` : ''}
     <section>
       <h2>#${ticket.number} — ${escapeHtml(ticket.title)}</h2>
       <div style="margin:8px 0">
         ${statusPill(ticket.status)} ${priorityPill(ticket.priority)}
         <span class="badge">${escapeHtml(categoryLabel(ticket.category))}</span>
         <span class="badge">${ticket.lang}</span>
       </div>
       <div class="muted" style="margin-bottom:8px">
         Reportado por <a href="/admin/chat/${ticket.user.id}">${escapeHtml(ticket.user.name ?? ticket.user.slackUserId)}</a>
         ${ticket.user.email ? `· ${escapeHtml(ticket.user.email)}` : ''}
       </div>
       ${timeline}
       <h2 style="margin-top:18px">Descripción</h2>
       <div class="desc">${escapeHtml(ticket.description)}</div>
     </section>
     <section>
       <h2>Gestionar ticket</h2>
       <form class="ticket" method="post" action="/admin/tickets/${ticket.id}/update">
         <label>Estado</label>
         <select name="status">${statusOptions}</select>
         <div class="hint">Al pasar a <strong>Solucionado</strong>, Vivo le envía automáticamente un DM en Slack a quien abrió el ticket.</div>
         <label>Prioridad</label>
         <select name="priority">${priorityOptions}</select>
         <label>Nota de solución (se envía al usuario al resolver)</label>
         <textarea name="resolutionNote" placeholder="Ej: Se corrigió el error de login, ya puedes entrar normalmente.">${escapeHtml(ticket.resolutionNote ?? '')}</textarea>
         <label>Nota interna (solo visible aquí)</label>
         <textarea name="adminNote">${escapeHtml(ticket.adminNote ?? '')}</textarea>
         <button type="submit">Guardar cambios</button>
       </form>
     </section>`,
  );
}

export function registerOAuthRoutes(router: IRouter): void {
  router.get('/admin', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      res.send(await renderUserList());
    } catch (err) {
      console.error('[admin] user list render failed:', (err as Error).message);
      res.status(500).send('Internal error');
    }
  });

  router.get('/admin/chat/:userId', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const html = await renderUserChat(req.params.userId);
      if (!html) {
        res.status(404).send('User not found');
        return;
      }
      res.send(html);
    } catch (err) {
      console.error('[admin] chat render failed:', (err as Error).message);
      res.status(500).send('Internal error');
    }
  });

  router.get('/admin/tickets', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const raw = String(req.query.status ?? '');
      const status = (TICKET_STATUSES as string[]).includes(raw)
        ? (raw as TicketStatus)
        : undefined;
      res.send(await renderTicketList(status));
    } catch (err) {
      console.error('[admin] ticket list render failed:', (err as Error).message);
      res.status(500).send('Internal error');
    }
  });

  router.get('/admin/tickets/:id', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const flash = req.query.saved
        ? req.query.notified === '1'
          ? 'Ticket actualizado. El usuario fue notificado por Slack ✅'
          : 'Ticket actualizado.'
        : undefined;
      const html = await renderTicketDetail(req.params.id, flash);
      if (!html) {
        res.status(404).send('Ticket not found');
        return;
      }
      res.send(html);
    } catch (err) {
      console.error('[admin] ticket detail render failed:', (err as Error).message);
      res.status(500).send('Internal error');
    }
  });

  router.post(
    '/admin/tickets/:id/update',
    express.urlencoded({ extended: false }),
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;
      try {
        const body = req.body as Record<string, string | undefined>;
        const status = (TICKET_STATUSES as string[]).includes(body.status ?? '')
          ? (body.status as TicketStatus)
          : undefined;
        const priority = (TICKET_PRIORITIES as string[]).includes(body.priority ?? '')
          ? (body.priority as TicketPriority)
          : undefined;
        if (!status || !priority) {
          res.status(400).send('Invalid status or priority');
          return;
        }
        const updated = await updateTicket(req.params.id, {
          status,
          priority,
          adminNote: body.adminNote,
          resolutionNote: body.resolutionNote,
        });
        if (!updated) {
          res.status(404).send('Ticket not found');
          return;
        }
        const notified = updated.notifiedAt && status === 'resolved' ? '&notified=1' : '';
        res.redirect(`/admin/tickets/${updated.id}?saved=1${notified}`);
      } catch (err) {
        console.error('[admin] ticket update failed:', (err as Error).message);
        res.status(500).send('Internal error');
      }
    },
  );

  router.get('/', (_req: Request, res: Response) => {
    res.send(
      page('Vivo Assistant', 'OAuth service is running. Use /vivo-connect in Slack to link your accounts.'),
    );
  });

  router.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  router.get('/oauth/google/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    if (error) {
      res.status(400).send(page('Connection cancelled', 'You can close this window and return to Slack.'));
      return;
    }
    const payload = verifyState(String(state ?? ''));
    if (!payload || payload.provider !== 'google' || !code) {
      res.status(400).send(INVALID_STATE_PAGE);
      return;
    }
    try {
      const { email } = await handleGoogleCallback(String(code), payload);
      res.send(
        page(
          'Google connected ✅',
          `Your Google account${email ? ` (${email})` : ''} has been connected successfully. You can return to Slack.`,
        ),
      );
    } catch (err) {
      console.error('[oauth] Google callback failed:', (err as Error).message);
      res.status(500).send(ERROR_PAGE);
    }
  });

  router.get('/oauth/clickup/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    if (error) {
      res.status(400).send(page('Connection cancelled', 'You can close this window and return to Slack.'));
      return;
    }
    const payload = verifyState(String(state ?? ''));
    if (!payload || payload.provider !== 'clickup' || !code) {
      res.status(400).send(INVALID_STATE_PAGE);
      return;
    }
    try {
      const { account } = await handleClickUpCallback(String(code), payload);
      res.send(
        page(
          'ClickUp connected ✅',
          `Your ClickUp account${account ? ` (${account})` : ''} has been connected successfully. You can return to Slack.`,
        ),
      );
    } catch (err) {
      console.error('[oauth] ClickUp callback failed:', (err as Error).message);
      res.status(500).send(ERROR_PAGE);
    }
  });
}

export function createStandaloneServer(): Express {
  const app = express();
  registerOAuthRoutes(app);
  return app;
}
