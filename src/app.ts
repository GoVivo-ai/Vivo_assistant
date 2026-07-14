import crypto from 'node:crypto';
import express, { type Express, type IRouter, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildTicketMcpServer } from './mcp/ticketMcp';
import { DateTime } from 'luxon';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { verifyState } from './security/encryption';
import { handleGoogleCallback } from './oauth/googleOAuth';
import { handleClickUpCallback } from './oauth/clickupOAuth';
import { adminShell, loginPage, logomarkSvg, publicPage } from './admin/ui';
import {
  countTicketsByStatus,
  getTicket,
  getTicketAttachment,
  listTickets,
  requestTicketInfo,
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

const INVALID_STATE_PAGE = publicPage(
  'Enlace inválido o expirado',
  'Este enlace de conexión no es válido o ya expiró. Ejecuta /vivo-connect en Slack de nuevo.',
  false,
);

const ERROR_PAGE = publicPage(
  'No se pudo completar la conexión',
  'Ocurrió un error al conectar tu cuenta. Inténtalo de nuevo desde Slack con /vivo-connect.',
  false,
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/* Admin session (signed cookie)                                       */
/* ------------------------------------------------------------------ */

const ADMIN_COOKIE = 'vivo_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sessionSecret(): string {
  return `${env.TOKEN_ENCRYPTION_KEY}:${env.ADMIN_DASHBOARD_KEY ?? ''}`;
}

function signSession(expiresAt: number): string {
  return crypto.createHmac('sha256', sessionSecret()).update(String(expiresAt)).digest('hex');
}

function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return `${expiresAt}.${signSession(expiresAt)}`;
}

function isValidSessionToken(token: string): boolean {
  const [expRaw, sig] = token.split('.');
  const expiresAt = Number(expRaw);
  if (!expiresAt || !sig || expiresAt < Date.now()) return false;
  const expected = signSession(expiresAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  const secure = env.APP_BASE_URL.startsWith('https') ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${encodeURIComponent(value)}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Session gate for the admin dashboard. Disabled entirely when no key is set. */
function requireAdmin(req: Request, res: Response): boolean {
  if (!env.ADMIN_DASHBOARD_KEY) {
    res.status(404).send('Not found');
    return false;
  }
  const token = readCookie(req, ADMIN_COOKIE);
  if (token && isValidSessionToken(token)) return true;
  res.redirect('/admin/login');
  return false;
}

/* ------------------------------------------------------------------ */
/* Rendering helpers                                                   */
/* ------------------------------------------------------------------ */

function fmtTs(d: Date): string {
  return DateTime.fromJSDate(d).setZone(env.COMPANY_TIMEZONE).toFormat('LLL d, h:mm a');
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
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
        .join(' ') || '<span class="badge none">sin conexiones</span>';
    const last = user.chatMessages[0]
      ? `último mensaje ${fmtTs(user.chatMessages[0].createdAt)}`
      : 'sin mensajes aún';
    return `<section class="card userrow fade-in">
      <div>
        <h2><a href="/admin/chat/${user.id}">${title}</a> <small class="muted">${subtitle}</small></h2>
        <div>${badges}</div>
      </div>
      <div style="text-align:right">
        <div><strong>${user._count.chatMessages}</strong> <span class="muted">mensajes</span></div>
        <div class="muted">${last}</div>
        <a class="go" href="/admin/chat/${user.id}">Ver conversación →</a>
      </div>
    </section>`;
  });

  return adminShell({
    title: 'Conversaciones',
    active: 'chats',
    heading: 'Conversaciones',
    subtitle: `Horarios en ${escapeHtml(env.COMPANY_TIMEZONE)}. Selecciona un usuario para ver su conversación completa con el asistente.`,
    body:
      rows.join('\n') ||
      '<section class="card fade-in"><p class="muted" style="margin:0">Todavía no hay usuarios registrados.</p></section>',
  });
}

interface ChatFile {
  slackFileId: string;
  name: string;
  mimetype: string;
  urlPrivate: string;
}

/** Parses ChatMessage.filesJson defensively — bad data renders no images. */
function parseChatFiles(filesJson: string | null): ChatFile[] {
  if (!filesJson) return [];
  try {
    const parsed = JSON.parse(filesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((f) => f as Record<string, unknown>)
      .filter((f) => typeof f.urlPrivate === 'string' && typeof f.mimetype === 'string')
      .map((f) => ({
        slackFileId: String(f.slackFileId ?? ''),
        name: String(f.name ?? 'screenshot'),
        mimetype: String(f.mimetype),
        urlPrivate: String(f.urlPrivate),
      }));
  } catch {
    return [];
  }
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

  const title = escapeHtml(user.name ?? user.slackUserId);
  const userInitials = escapeHtml(initials(user.name ?? user.slackUserId));
  const botAvatar = `<div class="avatar bot">${logomarkSvg('#ffffff', 18)}</div>`;

  const messages = [...user.chatMessages].reverse();
  const bubbles = messages
    .map((m) => {
      const images = parseChatFiles(m.filesJson)
        .map(
          (f, i) => `<a href="/admin/chat-files/${m.id}/${i}" target="_blank" title="${escapeHtml(f.name)}">
            <img src="/admin/chat-files/${m.id}/${i}" alt="${escapeHtml(f.name)}"
              style="max-width:220px;max-height:160px;border-radius:10px;border:1px solid rgba(0,0,0,.12);object-fit:cover;display:block">
          </a>`,
        )
        .join('\n');
      // Outbound-only messages (e.g. ticket DMs) have no user text — render
      // just the bot bubble instead of an empty user bubble.
      const userBubble = m.userText
        ? `
      <div class="msg user">
        <div class="avatar user-av">${userInitials}</div>
        <div>
          <div class="bubble">${escapeHtml(m.userText)}</div>
          ${images ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;justify-content:flex-end">${images}</div>` : ''}
          <div class="meta">${fmtTs(m.createdAt)} · ${m.source}</div>
        </div>
      </div>`
        : '';
      const botMeta = m.userText
        ? `<span class="chip">${escapeHtml(m.intent ?? '?')}</span>`
        : `${fmtTs(m.createdAt)} · <span class="chip">${escapeHtml(m.intent ?? m.source)}</span>`;
      return `${userBubble}
      <div class="msg bot">
        ${botAvatar}
        <div>
          <div class="bubble">${escapeHtml(m.botReply)}</div>
          <div class="meta">${botMeta}</div>
        </div>
      </div>`;
    })
    .join('\n');

  const badges =
    user.connections.map((c) => `<span class="badge">${c.provider}</span>`).join(' ') ||
    '<span class="badge none">sin conexiones</span>';

  return adminShell({
    title,
    active: 'chats',
    heading: title,
    subtitle: user.email ?? undefined,
    crumb: '<a href="/admin">← Todas las conversaciones</a>',
    body: `<section class="card fade-in">
       <div style="margin-bottom:4px">${badges}</div>
       <div class="chatwrap">
         <div class="chat">${bubbles || '<p class="muted">Sin mensajes aún.</p>'}</div>
       </div>
     </section>`,
  });
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
        `<a class="stat fade-in ${statusFilter === s.key ? 'active' : ''}" href="/admin/tickets${s.key ? `?status=${s.key}` : ''}">
           <strong>${s.count}</strong> <span>${escapeHtml(s.label)}</span></a>`,
    )
    .join('\n');

  const rows = tickets
    .map(
      (ticket) => `<tr>
        <td><a href="/admin/tickets/${ticket.id}">#${ticket.number}</a></td>
        <td><a href="/admin/tickets/${ticket.id}">${escapeHtml(ticket.title)}</a><br>
            <span class="muted">${escapeHtml(ticket.user.name ?? ticket.user.slackUserId)}</span></td>
        <td>${escapeHtml(categoryLabel(ticket.category))}</td>
        <td>${priorityPill(ticket.priority)}</td>
        <td>${statusPill(ticket.status)}</td>
        <td class="muted">${fmtTs(ticket.createdAt)}</td>
      </tr>`,
    )
    .join('\n');

  return adminShell({
    title: 'Tickets',
    active: 'tickets',
    heading: 'Tickets de soporte',
    subtitle: 'Tickets abiertos por los usuarios desde el chat con Vivo.',
    body: `<div class="stats">${stats}</div>
     <section class="card fade-in">
       ${
         tickets.length === 0
           ? '<p class="muted" style="margin:0">No hay tickets en esta vista.</p>'
           : `<table class="tickets">
                <thead><tr><th>#</th><th>Ticket</th><th>Categoría</th><th>Prioridad</th><th>Estado</th><th>Creado</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`
       }
     </section>`,
  });
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
    { text: `Abierto: ${fmtTs(ticket.createdAt)}`, warn: false },
    ticket.resolvedAt ? { text: `Solucionado: ${fmtTs(ticket.resolvedAt)}`, warn: false } : null,
    ticket.notifiedAt
      ? { text: `Usuario notificado por Slack: ${fmtTs(ticket.notifiedAt)}`, warn: false }
      : ticket.status === 'resolved'
        ? { text: 'El usuario aún NO ha sido notificado (el DM de Slack falló)', warn: true }
        : null,
  ]
    .filter((item): item is { text: string; warn: boolean } => item !== null)
    .map((item) => `<li class="${item.warn ? 'warn' : ''}">${escapeHtml(item.text)}</li>`)
    .join('\n');

  return adminShell({
    title: `Ticket #${ticket.number}`,
    active: 'tickets',
    heading: `#${ticket.number} — ${escapeHtml(ticket.title)}`,
    crumb: '<a href="/admin/tickets">← Todos los tickets</a>',
    body: `${flash ? `<div class="flash fade-in">✓ ${escapeHtml(flash)}</div>` : ''}
     <div class="detailgrid">
       <section class="card fade-in" style="margin:0">
         <div style="margin-bottom:10px">
           ${statusPill(ticket.status)} ${priorityPill(ticket.priority)}
           <span class="badge neutral">${escapeHtml(categoryLabel(ticket.category))}</span>
           <span class="badge neutral">${ticket.lang}</span>
         </div>
         <div class="muted" style="margin-bottom:6px">
           Reportado por <a href="/admin/chat/${ticket.user.id}" style="color:var(--teal);font-weight:600">${escapeHtml(ticket.user.name ?? ticket.user.slackUserId)}</a>
           ${ticket.user.email ? `· ${escapeHtml(ticket.user.email)}` : ''}
         </div>
         <ul class="timeline">${timeline}</ul>
         <h2 style="margin-top:14px">Descripción</h2>
         <div class="desc">${escapeHtml(ticket.description)}</div>
         ${
           ticket.attachments.length > 0
             ? `<h2 style="margin-top:14px">Pantallazos (${ticket.attachments.length})</h2>
                <div style="display:flex;flex-wrap:wrap;gap:10px">
                  ${ticket.attachments
                    .map(
                      (a) => `<a href="/admin/files/${a.id}" target="_blank" title="${escapeHtml(a.name)}">
                        <img src="/admin/files/${a.id}" alt="${escapeHtml(a.name)}"
                          style="max-width:220px;max-height:160px;border-radius:10px;border:1px solid rgba(0,0,0,.12);object-fit:cover;display:block">
                      </a>`,
                    )
                    .join('\n')}
                </div>`
             : ''
         }
       </section>
       <section class="card fade-in" style="margin:0">
         <h2>Gestionar ticket</h2>
         <form class="ticket" method="post" action="/admin/tickets/${ticket.id}/update">
           <label>Estado</label>
           <select name="status">${statusOptions}</select>
           <div class="hint">Al pasar a <strong>Solucionado</strong>, Vivo le envía automáticamente un DM en Slack a quien abrió el ticket.</div>
           <label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer">
             <input type="checkbox" name="notifyInProgress" value="1" style="width:auto;margin:0">
             Avisar al usuario por Slack que su caso está <strong>en proceso</strong>
           </label>
           <label>Mensaje de avance (opcional, se envía con el aviso)</label>
           <textarea name="progressNote" placeholder="Ej: Estamos revisando el problema con el equipo de datos."></textarea>
           <label>Prioridad</label>
           <select name="priority">${priorityOptions}</select>
           <label>Nota de solución (se envía al usuario al resolver)</label>
           <textarea name="resolutionNote" placeholder="Ej: Se corrigió el error de login, ya puedes entrar normalmente.">${escapeHtml(ticket.resolutionNote ?? '')}</textarea>
           <label>Nota interna (solo visible aquí)</label>
           <textarea name="adminNote">${escapeHtml(ticket.adminNote ?? '')}</textarea>
           <button type="submit">Guardar cambios</button>
         </form>
         <h2 style="margin-top:18px">Pedir más detalles</h2>
         <form class="ticket" method="post" action="/admin/tickets/${ticket.id}/request-info">
           <label>Pregunta para el usuario (opcional — si la dejas vacía, Vivo pide detalles genéricos)</label>
           <textarea name="question" placeholder="Ej: ¿En qué navegador te pasa y qué mensaje de error ves exactamente?"></textarea>
           <button type="submit">Enviar solicitud por Slack</button>
           <div class="hint">La respuesta del usuario llega a su chat con Vivo (visible en “Chat” de este usuario).</div>
         </form>
       </section>
     </div>`,
  });
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function registerOAuthRoutes(router: IRouter): void {
  router.get('/admin/login', (req: Request, res: Response) => {
    if (!env.ADMIN_DASHBOARD_KEY) {
      res.status(404).send('Not found');
      return;
    }
    const token = readCookie(req, ADMIN_COOKIE);
    if (token && isValidSessionToken(token)) {
      res.redirect('/admin');
      return;
    }
    res.send(loginPage());
  });

  router.post(
    '/admin/login',
    express.urlencoded({ extended: false }),
    async (req: Request, res: Response) => {
      const key = env.ADMIN_DASHBOARD_KEY;
      if (!key) {
        res.status(404).send('Not found');
        return;
      }
      const provided = Buffer.from(String((req.body as Record<string, unknown>).key ?? ''));
      const expected = Buffer.from(key);
      const valid =
        provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
      if (!valid) {
        // Small fixed delay to slow down brute-force attempts.
        await new Promise((resolve) => setTimeout(resolve, 400));
        res.status(401).send(loginPage('Clave incorrecta. Inténtalo de nuevo.'));
        return;
      }
      res
        .set('Set-Cookie', sessionCookie(createSessionToken(), SESSION_TTL_MS / 1000))
        .redirect('/admin');
    },
  );

  router.get('/admin/logout', (_req: Request, res: Response) => {
    res.set('Set-Cookie', sessionCookie('', 0)).redirect('/admin/login');
  });

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

  // Serves ticket screenshots. Slack's url_private requires the bot token,
  // so the browser can't load it directly — this proxies it behind the
  // admin session.
  router.get('/admin/files/:id', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const attachment = await getTicketAttachment(req.params.id);
      if (!attachment) {
        res.status(404).send('Not found');
        return;
      }
      const upstream = await fetch(attachment.urlPrivate, {
        headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
      });
      // Without the files:read scope Slack answers 200 with an HTML login
      // page — serve an explicit error instead of a broken image.
      if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/')) {
        res
          .status(502)
          .send('Could not fetch file from Slack — check the bot token has the files:read scope');
        return;
      }
      res.set('Content-Type', attachment.mimetype);
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      console.error('[admin] file proxy failed:', (err as Error).message);
      res.status(500).send('Internal error');
    }
  });

  // Serves screenshots sent in chat (same Slack url_private proxy as above,
  // but sourced from the ChatMessage the image arrived with).
  router.get('/admin/chat-files/:id/:idx', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const message = await prisma.chatMessage.findUnique({
        where: { id: req.params.id },
        select: { filesJson: true },
      });
      const files = parseChatFiles(message?.filesJson ?? null);
      const idx = Number(req.params.idx);
      const file = Number.isInteger(idx) ? files[idx] : undefined;
      if (!file) {
        res.status(404).send('Not found');
        return;
      }
      const upstream = await fetch(file.urlPrivate, {
        headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
      });
      if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/')) {
        res
          .status(502)
          .send('Could not fetch file from Slack — check the bot token has the files:read scope');
        return;
      }
      res.set('Content-Type', file.mimetype);
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      console.error('[admin] chat file proxy failed:', (err as Error).message);
      res.status(500).send('Internal error');
    }
  });

  router.get('/admin/tickets/:id', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const flash = req.query.saved
        ? req.query.notified === '1'
          ? 'Ticket actualizado. El usuario fue notificado por Slack.'
          : req.query.progress === '1'
            ? 'Ticket actualizado. Se le avisó al usuario por Slack que su caso está en proceso.'
            : 'Ticket actualizado.'
        : req.query.asked === '1'
          ? 'Se le pidió más información al usuario por Slack.'
          : req.query.asked === '0'
            ? 'No se pudo enviar la solicitud por Slack. Inténtalo de nuevo.'
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
          notifyInProgress: body.notifyInProgress === '1',
          progressNote: body.progressNote,
        });
        if (!updated) {
          res.status(404).send('Ticket not found');
          return;
        }
        const notified = updated.notifiedAt && status === 'resolved' ? '&notified=1' : '';
        const progress = updated.progressNotified ? '&progress=1' : '';
        res.redirect(`/admin/tickets/${updated.id}?saved=1${notified}${progress}`);
      } catch (err) {
        console.error('[admin] ticket update failed:', (err as Error).message);
        res.status(500).send('Internal error');
      }
    },
  );

  router.post(
    '/admin/tickets/:id/request-info',
    express.urlencoded({ extended: false }),
    async (req: Request, res: Response) => {
      if (!requireAdmin(req, res)) return;
      try {
        const body = req.body as Record<string, string | undefined>;
        const sent = await requestTicketInfo(req.params.id, body.question);
        res.redirect(`/admin/tickets/${req.params.id}?asked=${sent ? '1' : '0'}`);
      } catch (err) {
        console.error('[admin] ticket request-info failed:', (err as Error).message);
        res.status(500).send('Internal error');
      }
    },
  );

  // MCP endpoint (stateless streamable HTTP): lets an external agent such as
  // Claude Code manage tickets with the same service layer as the admin panel.
  // Auth: Authorization: Bearer <ADMIN_DASHBOARD_KEY>.
  router.post('/mcp', express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
    const key = env.ADMIN_DASHBOARD_KEY;
    const provided = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(provided);
    const b = Buffer.from(key ?? '');
    if (!key || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
      return;
    }
    try {
      const server = buildTicketMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', (err as Error).message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  });

  router.get('/', (_req: Request, res: Response) => {
    res.send(
      publicPage(
        'Vivo Assistant',
        'El servicio está activo. Usa /vivo-connect en Slack para vincular tus cuentas.',
      ),
    );
  });

  router.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  router.get('/oauth/google/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    if (error) {
      res
        .status(400)
        .send(
          publicPage('Conexión cancelada', 'Puedes cerrar esta ventana y volver a Slack.', false),
        );
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
        publicPage(
          'Google conectado ✅',
          `Tu cuenta de Google${email ? ` (${email})` : ''} se conectó correctamente. Ya puedes volver a Slack.`,
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
      res
        .status(400)
        .send(
          publicPage('Conexión cancelada', 'Puedes cerrar esta ventana y volver a Slack.', false),
        );
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
        publicPage(
          'ClickUp conectado ✅',
          `Tu cuenta de ClickUp${account ? ` (${account})` : ''} se conectó correctamente. Ya puedes volver a Slack.`,
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
