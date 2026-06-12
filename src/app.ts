import express, { type Express, type IRouter, type Request, type Response } from 'express';
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

export function registerOAuthRoutes(router: IRouter): void {
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
