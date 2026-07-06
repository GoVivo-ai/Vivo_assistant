// Vercel serverless entrypoint: hosts the full app — the Slack bot in HTTP
// mode (events, slash commands and interactivity at /slack/events), the OAuth
// callbacks and the admin dashboard. Requires Socket Mode to be DISABLED in
// the Slack app config, with the Event Subscriptions / Interactivity /
// slash-command request URL pointing at https://<deployment>/slack/events.
import express from 'express';
import { registerOAuthRoutes } from '../src/app';
import { createHttpSlackReceiver } from '../src/slack/httpSlackApp';

const app = express();

// Slack retries any event it didn't get an ack for within 3 seconds, and the
// AI reply often takes longer than that. The original invocation is still
// running (processBeforeResponse) and will answer, so ack-and-drop timeout
// retries here — otherwise users get duplicate replies.
app.post('/slack/events', (req, res, next) => {
  if (req.headers['x-slack-retry-reason'] === 'http_timeout') {
    res.status(200).send();
    return;
  }
  next();
});

app.use(createHttpSlackReceiver().app);
registerOAuthRoutes(app);

export default app;
