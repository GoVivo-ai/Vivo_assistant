import type { SlackImageFile } from '../types';

/**
 * Short-lived stash for a ticket-info reply that couldn't be matched to a
 * single ticket. The assistant asks "which ticket is this for?"; when the
 * user answers with the number, the stashed text/files get attached to it.
 * In-memory on purpose, mirroring attachmentStore: losing it only means the
 * user re-sends their answer.
 */
const TTL_MS = 30 * 60 * 1000;

const pending = new Map<string, { text: string; files: SlackImageFile[]; at: number }>();

export function stashInfoReply(userId: string, text: string, files: SlackImageFile[]): void {
  pending.set(userId, { text, files, at: Date.now() });
}

/** Returns and clears the user's stashed reply (null if expired/absent). */
export function takeInfoReply(
  userId: string,
): { text: string; files: SlackImageFile[] } | null {
  const entry = pending.get(userId);
  pending.delete(userId);
  if (!entry || Date.now() - entry.at > TTL_MS) return null;
  return { text: entry.text, files: entry.files };
}
