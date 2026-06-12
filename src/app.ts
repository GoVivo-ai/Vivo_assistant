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

const STATUS_COLORS: Record<string, string> = {
  success: '#16a34a',
  empty: '#ca8a04',
  error: '#dc2626',
  not_connected: '#9333ea',
  denied: '#dc2626',
};

async function renderAdminDashboard(): Promise<string> {
  const users = await prisma.user.findMany({
    include: {
      connections: { select: { provider: true, providerEmail: true } },
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const fmt = (d: Date) =>
    DateTime.fromJSDate(d).setZone(env.COMPANY_TIMEZONE).toFormat('LLL d, h:mm a');

  const sections = users.map((user) => {
    const title = escapeHtml(user.name ?? user.slackUserId);
    const subtitle = escapeHtml(user.email ?? '');
    const badges = user.connections
      .map(
        (c) =>
          `<span class="badge">${c.provider}${c.providerEmail ? ` · ${escapeHtml(c.providerEmail)}` : ''}</span>`,
      )
      .join(' ');
    const rows = user.auditLogs
      .map(
        (log) => `<tr>
          <td class="muted">${fmt(log.createdAt)}</td>
          <td><code>${escapeHtml(log.action)}</code></td>
          <td>${log.provider ? escapeHtml(log.provider) : '—'}</td>
          <td>${log.query ? escapeHtml(log.query) : '—'}</td>
          <td><span style="color:${STATUS_COLORS[log.status] ?? '#555'}">●</span> ${escapeHtml(log.status)}</td>
        </tr>`,
      )
      .join('\n');
    return `<section>
      <h2>${title} <small class="muted">${subtitle}</small></h2>
      <div class="badges">${badges || '<span class="badge none">no connections</span>'}</div>
      ${
        user.auditLogs.length > 0
          ? `<table><thead><tr><th>When (${escapeHtml(env.COMPANY_TIMEZONE)})</th><th>Action</th><th>Provider</th><th>Query</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="muted">No activity yet.</p>'
      }
    </section>`;
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vivo Assistant — Activity</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; max-width: 960px; margin: 0 auto;
             padding: 32px 20px; background: #f4f4f7; color: #1a1d29; }
      h1 { font-size: 22px; } h2 { font-size: 16px; margin: 0 0 6px; }
      section { background: #fff; border-radius: 12px; padding: 20px 24px; margin: 16px 0;
                box-shadow: 0 2px 8px rgba(0,0,0,.05); }
      table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
      th { text-align: left; color: #888; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #eee; }
      td { padding: 6px 8px; border-bottom: 1px solid #f3f3f3; vertical-align: top; }
      code { background: #f1f1f4; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
      .muted { color: #999; font-weight: 400; font-size: 12px; }
      .badge { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 99px;
               padding: 2px 10px; font-size: 12px; margin-right: 6px; }
      .badge.none { background: #f3f4f6; color: #9ca3af; }
    </style>
  </head>
  <body>
    <h1>Vivo Assistant — Activity</h1>
    <p class="muted">Last 30 interactions per user. Only metadata is stored (action, provider, truncated query, status) — never API responses or tokens.</p>
    ${sections.join('\n') || '<section><p class="muted">No users yet.</p></section>'}
  </body>
</html>`;
}

export function registerOAuthRoutes(router: IRouter): void {
  router.get('/admin', async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      res.send(await renderAdminDashboard());
    } catch (err) {
      console.error('[admin] dashboard render failed:', (err as Error).message);
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
