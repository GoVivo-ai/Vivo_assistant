import type { SlackImageFile } from '../types';

/**
 * Short-lived per-user stash of screenshots sent over Slack. Lets a user send
 * the image and the problem description in separate messages: whichever ticket
 * they open within the TTL picks the images up. In-memory on purpose — the
 * bot runs as a single Socket Mode process and losing a stash on restart only
 * means the user re-sends the screenshot.
 */
const TTL_MS = 30 * 60 * 1000;
const MAX_FILES_PER_USER = 5;

const pending = new Map<string, { files: SlackImageFile[]; at: number }>();

export function stashPendingFiles(userId: string, files: SlackImageFile[]): void {
  if (files.length === 0) return;
  const entry = pending.get(userId);
  const existing = entry && Date.now() - entry.at < TTL_MS ? entry.files : [];
  const merged = [...existing, ...files]
    .filter((f, i, all) => all.findIndex((o) => o.slackFileId === f.slackFileId) === i)
    .slice(-MAX_FILES_PER_USER);
  pending.set(userId, { files: merged, at: Date.now() });
}

/** Returns and clears the user's pending files (empty if expired). */
export function takePendingFiles(userId: string): SlackImageFile[] {
  const entry = pending.get(userId);
  pending.delete(userId);
  if (!entry || Date.now() - entry.at > TTL_MS) return [];
  return entry.files;
}
