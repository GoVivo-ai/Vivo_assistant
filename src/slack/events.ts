import type { App } from '@slack/bolt';
import type { GenericMessageEvent } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { handleAssistantQuery } from '../ai/assistant';
import type { SlackProfile } from '../services/userService';
import { t } from '../utils/formatters';

const EMPTY_PROMPT_TEXT =
  'Hi! Ask me about your Drive files, calendar or ClickUp tasks — in English o en español. Try `/vivo-help` for examples.';

async function fetchProfile(client: WebClient, userId: string): Promise<SlackProfile | undefined> {
  // Best-effort enrichment (requires users:read).
  try {
    const info = await client.users.info({ user: userId });
    return {
      name: info.user?.real_name ?? info.user?.name,
      email: info.user?.profile?.email,
    };
  } catch {
    return undefined;
  }
}

async function answer(
  client: WebClient,
  say: (msg: { text: string; thread_ts?: string }) => Promise<unknown>,
  slackUserId: string,
  slackTeamId: string,
  rawText: string,
  threadTs?: string,
): Promise<void> {
  const text = rawText.replace(/<@[^>]+>/g, '').trim();
  if (!text) {
    await say({ text: EMPTY_PROMPT_TEXT, thread_ts: threadTs });
    return;
  }

  const profile = await fetchProfile(client, slackUserId);
  try {
    const reply = await handleAssistantQuery(slackUserId, slackTeamId, text, profile);
    await say({ text: reply, thread_ts: threadTs });
  } catch (err) {
    console.error('[events] assistant query failed:', (err as Error).message);
    await say({ text: t('en').genericError, thread_ts: threadTs });
  }
}

export function registerEvents(app: App): void {
  // Mentions in channels: reply in a thread.
  app.event('app_mention', async ({ event, say, client, context }) => {
    await answer(
      client,
      say,
      event.user as string,
      context.teamId ?? event.team ?? 'unknown',
      event.text,
      event.thread_ts ?? event.ts,
    );
  });

  // Direct messages: reply inline (requires im:history scope + message.im event).
  app.message(async ({ message, say, client, context }) => {
    if (message.subtype !== undefined) return; // skip edits, deletes, joins, etc.
    const dm = message as GenericMessageEvent;
    if (dm.channel_type !== 'im' || !dm.user || dm.bot_id) return;
    await answer(client, say, dm.user, context.teamId ?? dm.team ?? 'unknown', dm.text ?? '');
  });
}
