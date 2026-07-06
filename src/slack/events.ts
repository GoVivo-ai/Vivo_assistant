import type { App } from '@slack/bolt';
import type { GenericMessageEvent } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { handleAssistantQuery } from '../ai/assistant';
import type { SlackProfile } from '../services/userService';
import type { SlackImageFile } from '../types';
import { t } from '../utils/formatters';

const EMPTY_PROMPT_TEXT =
  'Hi! Ask me about your Drive files, calendar or ClickUp tasks — in English o en español. Try `/vivo-help` for examples.';

/** Pulls image attachments (screenshots) out of a Slack event payload. */
function extractImageFiles(event: unknown): SlackImageFile[] {
  const files = (event as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  return files
    .map((f) => f as Record<string, unknown>)
    .filter((f) => typeof f.mimetype === 'string' && f.mimetype.startsWith('image/'))
    .map((f) => ({
      slackFileId: String(f.id ?? ''),
      name: String(f.name ?? 'screenshot'),
      mimetype: String(f.mimetype),
      urlPrivate: String(f.url_private ?? ''),
      size: Number(f.size ?? 0),
    }))
    .filter((f) => f.slackFileId && f.urlPrivate);
}

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
  source: 'dm' | 'mention',
  threadTs?: string,
  files: SlackImageFile[] = [],
): Promise<void> {
  const text = rawText.replace(/<@[^>]+>/g, '').trim();
  if (!text && files.length === 0) {
    await say({ text: EMPTY_PROMPT_TEXT, thread_ts: threadTs });
    return;
  }

  const profile = await fetchProfile(client, slackUserId);
  try {
    const reply = await handleAssistantQuery(slackUserId, slackTeamId, text, profile, source, files);
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
      'mention',
      event.thread_ts ?? event.ts,
      extractImageFiles(event),
    );
  });

  // Direct messages: reply inline (requires im:history scope + message.im event).
  // subtype "file_share" is a normal user message that carries attachments.
  app.message(async ({ message, say, client, context }) => {
    if (message.subtype !== undefined && message.subtype !== 'file_share') return; // skip edits, deletes, joins, etc.
    const dm = message as GenericMessageEvent;
    if (dm.channel_type !== 'im' || !dm.user || dm.bot_id) return;
    await answer(
      client,
      say,
      dm.user,
      context.teamId ?? dm.team ?? 'unknown',
      dm.text ?? '',
      'dm',
      undefined,
      extractImageFiles(dm),
    );
  });
}
