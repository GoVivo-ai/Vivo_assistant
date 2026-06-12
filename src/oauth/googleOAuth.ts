import { google } from 'googleapis';
import { env } from '../config/env';
import type { OAuthStatePayload } from '../security/encryption';
import { getOrCreateUser } from '../services/userService';
import { upsertConnection } from '../services/connectionService';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function createGoogleOAuthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export function getGoogleAuthUrl(state: string): string {
  return createGoogleOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  });
}

/**
 * Exchanges the authorization code, stores the encrypted tokens for the
 * Slack user encoded in the signed state, and returns the connected email.
 */
export async function handleGoogleCallback(
  code: string,
  state: OAuthStatePayload,
): Promise<{ email: string | null }> {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Google token exchange returned no access token');
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  const user = await getOrCreateUser(state.slackUserId, state.slackTeamId, {
    name: profile.name ?? undefined,
    email: profile.email ?? undefined,
  });

  await upsertConnection({
    userId: user.id,
    provider: 'google',
    providerAccountId: profile.id ?? null,
    providerEmail: profile.email ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    scopes: tokens.scope ?? GOOGLE_SCOPES.join(' '),
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  });

  return { email: profile.email ?? null };
}
