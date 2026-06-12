import crypto from 'node:crypto';
import express, { type Express, type IRouter, type Request, type Response } from 'express';
import { DateTime } from 'luxon';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { verifyState } from './security/encryption';
import { handleGoogleCallback } from './oauth/googleOAuth';
import { handleClickUpCallback } from './oauth/clickupOAuth';

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
`;

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
