import { env } from '../config/env';
import { decryptToken } from '../security/encryption';
import { getConnection, updateConnectionTokens } from './connectionService';
import { NotConnectedError, ReconnectRequiredError } from '../types';

const EXPIRY_BUFFER_MS = 60_000;

interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/**
 * Returns a valid Google access token for the given internal user,
 * refreshing it transparently when expired. Never logs token values.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const connection = await getConnection(userId, 'google');
  if (!connection) {
    throw new NotConnectedError('google');
  }

  const isExpired =
    connection.expiresAt !== null &&
    connection.expiresAt.getTime() <= Date.now() + EXPIRY_BUFFER_MS;

  if (!isExpired) {
    return decryptToken(connection.accessTokenEncrypted);
  }

  if (!connection.refreshTokenEncrypted) {
    throw new ReconnectRequiredError('google');
  }

  const refreshToken = decryptToken(connection.refreshTokenEncrypted);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    // invalid_grant => refresh token revoked/expired; user must reconnect
    throw new ReconnectRequiredError('google');
  }

  const data = (await response.json()) as GoogleRefreshResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await updateConnectionTokens(connection.id, data.access_token, expiresAt);
  return data.access_token;
}

/**
 * Returns the ClickUp access token for the given internal user.
 * ClickUp OAuth tokens do not expire, so no refresh flow is needed.
 */
export async function getClickUpAccessToken(userId: string): Promise<string> {
  const connection = await getConnection(userId, 'clickup');
  if (!connection) {
    throw new NotConnectedError('clickup');
  }
  return decryptToken(connection.accessTokenEncrypted);
}
