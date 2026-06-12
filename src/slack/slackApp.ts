import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { env } from '../config/env';

/**
 * Socket Mode is used when SLACK_APP_TOKEN is set (recommended for local dev:
 * Slack events arrive over a websocket, no public URL needed). Otherwise the
 * app runs over HTTP with an ExpressReceiver at POST /slack/events.
 * OAuth callbacks always need a public HTTP URL (APP_BASE_URL).
 */
export const isSocketMode = Boolean(env.SLACK_APP_TOKEN && env.SLACK_APP_TOKEN.length > 0);

export const receiver = isSocketMode
  ? undefined
  : new ExpressReceiver({
      signingSecret: env.SLACK_SIGNING_SECRET,
      endpoints: '/slack/events',
    });

export const slackApp = isSocketMode
  ? new App({
      token: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: LogLevel.INFO,
    })
  : new App({
      token: env.SLACK_BOT_TOKEN,
      receiver: receiver!,
      logLevel: LogLevel.INFO,
    });
