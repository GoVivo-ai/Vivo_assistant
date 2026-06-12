import type { App } from '@slack/bolt';
import { handleAssistantQuery } from '../ai/assistant';
import type { SlackProfile } from '../services/userService';
import { GENERIC_ERROR_TEXT } from '../utils/formatters';

export function registerEvents(app: App): void {
  app.event('app_mention', async ({ event, say, client, context }) => {
    const text = event.text.replace(/<@[^>]+>/g, '').trim();
    const threadTs = event.thread_ts ?? event.ts;

    if (!text) {
      await say({
        text: 'Hi! Ask me about your Drive files, calendar or ClickUp tasks. Try `/vivo-help` for examples.',
        thread_ts: threadTs,
      });
      return;
    }

    // Best-effort profile enrichment (requires users:read).
    let profile: SlackProfile | undefined;
    try {
      const info = await client.users.info({ user: event.user as string });
      profile = {
        name: info.user?.real_name ?? info.user?.name,
        email: info.user?.profile?.email,
      };
    } catch {
      profile = undefined;
    }

    try {
      const answer = await handleAssistantQuery(
        event.user as string,
        context.teamId ?? event.team ?? 'unknown',
        text,
        profile,
      );
      await say({ text: answer, thread_ts: threadTs });
    } catch (err) {
      console.error('[events] app_mention handler failed:', (err as Error).message);
      await say({ text: GENERIC_ERROR_TEXT, thread_ts: threadTs });
    }
  });
}
