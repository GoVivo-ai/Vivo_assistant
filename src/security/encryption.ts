import crypto from 'node:crypto';
import { env } from '../config/env';
import type { ProviderName } from '../types';

/**
 * AES-256-GCM token encryption.
 * TOKEN_ENCRYPTION_KEY: a 64-char hex string is used directly as the 32-byte key;
 * any other string is hashed with SHA-256 to derive the key.
 */
function getKey(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted token format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Signed OAuth state: maps the OAuth callback back to the Slack user that
 * initiated the flow, and cannot be forged or tampered with.
 */
export interface OAuthStatePayload {
  slackUserId: string;
  slackTeamId: string;
  provider: ProviderName;
  exp: number;
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', getKey()).update(data).digest('base64url');
}

export function signState(
  payload: Omit<OAuthStatePayload, 'exp'>,
  ttlSeconds = 600,
): string {
  const full: OAuthStatePayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifyState(state: string): OAuthStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = hmac(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!payload.slackUserId || !payload.slackTeamId || !payload.provider) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
