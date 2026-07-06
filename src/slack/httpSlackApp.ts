import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { env } from '../config/env';
import { registerCommands } from './commands';
import { registerEvents } from './events';

/**
 * HTTP-mode Bolt app for the Vercel serverless entrypoint. Always uses the
 * ExpressReceiver — serverless can't hold Socket Mode's websocket open — so
 * SLACK_APP_TOKEN is ignored here on purpose (it can stay set for local dev).
 *
 * processBeforeResponse keeps the function alive until the handler finishes:
 * the AI reply can take longer than Slack's 3-second ack window, in which
 * case Slack re-delivers the event — those retries are dropped upstream in
 * api/index.ts (x-slack-retry-reason: http_timeout) so users never get
 * duplicate replies.
 */
export function createHttpSlackReceiver(): ExpressReceiver {
  const receiver = new ExpressReceiver({
    signingSecret: env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events',
    processBeforeResponse: true,
  });
  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver,
    processBeforeResponse: true,
    logLevel: LogLevel.INFO,
  });
  registerCommands(app);
  registerEvents(app);
  return receiver;
}
