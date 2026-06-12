import { env } from '../config/env';
import type { OAuthStatePayload } from '../security/encryption';
import { getOrCreateUser } from '../services/userService';
import { upsertConnection } from '../services/connectionService';

const CLICKUP_AUTHORIZE_URL = 'https://app.clickup.com/api';
const CLICKUP_TOKEN_URL = 'https://api.clickup.com/api/v2/oauth/token';
const CLICKUP_USER_URL = 'https://api.clickup.com/api/v2/user';

export function getClickUpAuthUrl(state: string): string {
  const url = new URL(CLICKUP_AUTHORIZE_URL);
  url.searchParams.set('client_id', env.CLICKUP_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.CLICKUP_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

interface ClickUpTokenResponse {
  access_token: string;
}

interface ClickUpUser {
  id: number;
  username: string;
  email: string;
}

/**
 * Exchanges the authorization code, stores the encrypted token for the
 * Slack user encoded in the signed state, and returns the account name.
 * ClickUp OAuth tokens do not expire and have no refresh token.
 */
export async function handleClickUpCallback(
  code: string,
  state: OAuthStatePayload,
): Promise<{ account: string | null }> {
  const tokenResponse = await fetch(CLICKUP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.CLICKUP_CLIENT_ID,
      client_secret: env.CLICKUP_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`ClickUp token exchange failed with status ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as ClickUpTokenResponse;
  if (!tokenData.access_token) {
    throw new Error('ClickUp token exchange returned no access token');
  }

  let clickupUser: ClickUpUser | null = null;
  try {
    const userResponse = await fetch(CLICKUP_USER_URL, {
      headers: { Authorization: tokenData.access_token },
    });
    if (userResponse.ok) {
      const data = (await userResponse.json()) as { user: ClickUpUser };
      clickupUser = data.user;
    }
  } catch {
    // Profile fetch is best-effort; the connection still works without it.
  }

  const user = await getOrCreateUser(state.slackUserId, state.slackTeamId, {
    name: clickupUser?.username,
    email: clickupUser?.email,
  });

  await upsertConnection({
    userId: user.id,
    provider: 'clickup',
    providerAccountId: clickupUser ? String(clickupUser.id) : null,
    providerEmail: clickupUser?.email ?? null,
    accessToken: tokenData.access_token,
    refreshToken: null,
    scopes: null,
    expiresAt: null,
  });

  return { account: clickupUser?.username ?? null };
}
