# Vivo Assistant

Internal Slack assistant for Vivo. Answers questions about **Google Drive files**, **Google Calendar meetings** and **ClickUp tasks** — always using the personal OAuth credentials of the Slack user who asks.

> **Golden rule:** *The assistant must only access data using the credentials of the Slack user who made the request.* There is no global/service account. If a user hasn't connected an account, the bot asks them to run `/vivo-connect`. If their credentials can't see a file/event/task, the bot reports no results.

## How it works

```
@Vivo Assistant what meetings do I have this week?
        │
        ▼
 Slack app_mention ──► AI intent router (OpenAI or Anthropic, strict JSON)
        │                       │
        ▼                       ▼
 Resolve Slack user ──► Tool (Drive / Calendar / ClickUp)
        │                       │ uses ONLY that user's encrypted OAuth tokens
        ▼                       ▼
   Audit log (metadata only) ◄── formatted Slack reply
```

## Requirements

- Node.js 20+ (22 recommended)
- PostgreSQL 14+ (or Docker)
- A Slack workspace where you can create apps
- Google Cloud project (Drive + Calendar APIs)
- ClickUp workspace admin access (to create an OAuth app)
- OpenAI **or** Anthropic API key

## 1. Create the Slack App

1. Go to <https://api.slack.com/apps> → **Create New App** → *From scratch* → name it **Vivo Assistant**.
2. **OAuth & Permissions → Bot Token Scopes**, add:
   - `app_mentions:read`
   - `chat:write`
   - `commands`
   - `users:read`
   - `users:read.email` *(optional, lets the bot store the user's email)*
3. **Slash Commands**, create (Request URL only needed in HTTP mode: `https://<APP_BASE_URL>/slack/events`):
   - `/vivo-connect` — Connect your Google & ClickUp accounts
   - `/vivo-disconnect` — Remove your connected accounts
   - `/vivo-whoami` — Show your connected accounts
   - `/vivo-help` — Show usage examples
4. **Event Subscriptions** → enable, subscribe to bot event `app_mention` (same Request URL in HTTP mode).
5. **Recommended for local dev — Socket Mode:** enable Socket Mode under *Settings → Socket Mode*, create an **App-Level Token** with scope `connections:write` (`xapp-...`) and put it in `SLACK_APP_TOKEN`. With Socket Mode you don't need public URLs for Slack (only for OAuth callbacks).
6. **Install App** to your workspace → copy the **Bot User OAuth Token** (`xoxb-...`) and the **Signing Secret** (*Basic Information*).

> This MVP intentionally avoids `channels:history` / `groups:history` / `im:history`. The bot only sees messages where it is explicitly mentioned.

## 2. Configure Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project.
2. **APIs & Services → Library**: enable **Google Drive API** and **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: configure (Internal if you use Google Workspace), add scopes:
   - `.../auth/drive.metadata.readonly`
   - `.../auth/calendar.readonly`
   - `.../auth/userinfo.email`, `.../auth/userinfo.profile`
4. **Credentials → Create Credentials → OAuth client ID** → *Web application*:
   - Authorized redirect URI: `https://<APP_BASE_URL>/oauth/google/callback`
5. Copy the **Client ID** and **Client Secret** into `.env`.

## 3. Configure ClickUp OAuth

1. In ClickUp: **Settings → Integrations → ClickUp API** → **Create an App**.
2. Redirect URL: `https://<APP_BASE_URL>/oauth/clickup/callback`
3. Copy the **Client ID** and **Client Secret** into `.env`.

> ClickUp OAuth tokens do not expire and have no refresh token.

## 4. Create your .env

```bash
cp .env.example .env
openssl rand -hex 32   # → TOKEN_ENCRYPTION_KEY
```

Fill in every value. Notes:

- `AI_PROVIDER` is `openai` or `anthropic`; the matching API key is required.
- `APP_BASE_URL` must be the public HTTPS URL where OAuth callbacks arrive (ngrok URL locally).
- `TOKEN_ENCRYPTION_KEY` is **mandatory** — it encrypts all OAuth tokens (AES-256-GCM) and signs OAuth `state`.

## 5. Run locally

```bash
npm install
npx prisma migrate dev --name init   # creates the schema (needs DATABASE_URL up)
npm run dev
```

If you don't have local Postgres: `docker compose up -d db` and use the `DATABASE_URL` from `.env.example`.

## 6. ngrok for local OAuth callbacks

```bash
ngrok http 3000
```

Use the generated `https://xxxx.ngrok-free.app` URL as:

- `APP_BASE_URL`
- `GOOGLE_REDIRECT_URI=https://xxxx.ngrok-free.app/oauth/google/callback` (also update it in Google Cloud Console)
- `CLICKUP_REDIRECT_URI=https://xxxx.ngrok-free.app/oauth/clickup/callback` (also update it in ClickUp)
- In HTTP mode (no `SLACK_APP_TOKEN`), also set Slack Request URLs to `https://xxxx.ngrok-free.app/slack/events`. In Socket Mode this is not needed.

## 7. OAuth callbacks on Vercel (stable URL, no ngrok)

The repo includes `api/index.ts` + `vercel.json`: Vercel serves **only** the stateless OAuth callbacks (`/oauth/google/callback`, `/oauth/clickup/callback`) and writes the encrypted tokens to the shared database. The bot itself is a long-lived Socket Mode process and **cannot run on Vercel** — keep it running locally or on a server.

1. Create a Vercel project connected to this repo (every push to `main` deploys).
2. In *Settings → Environment Variables*, paste your entire local `.env` (Vercel parses multi-line pastes). `TOKEN_ENCRYPTION_KEY` and `DATABASE_URL` **must be identical** to the ones the bot uses, otherwise the bot can't decrypt the stored tokens.
3. Use `https://<project>.vercel.app/oauth/google/callback` and `.../oauth/clickup/callback` as redirect URIs in Google Cloud Console and ClickUp, and set `APP_BASE_URL=https://<project>.vercel.app` everywhere.
4. Redeploy after changing env vars.

## 8. Run with Docker

```bash
docker compose up --build
```

This starts Postgres and the app, applies migrations (`prisma migrate deploy`) and listens on port 3000.

## Commands

| Command | What it does |
|---|---|
| `/vivo-connect` | Buttons to connect Google Drive & Calendar, and ClickUp (per-user OAuth) |
| `/vivo-whoami` | Shows your connected accounts and scopes |
| `/vivo-disconnect [google\|clickup]` | Removes one or all of your connections |
| `/vivo-help` | Usage examples |

## Usage examples

```
@Vivo Assistant find Alexia proposal
@Vivo Assistant where is the Vectora website folder?
@Vivo Assistant what meetings do I have today?
@Vivo Assistant what meetings do I have this week?
@Vivo Assistant status of payroll task
@Vivo Assistant show my overdue tasks
@Vivo Assistant what tasks do I have pending?
```

## Security notes

- **Per-user credentials only.** Every Drive/Calendar/ClickUp call uses the OAuth tokens of the Slack user who sent the message. There is no shared or global account.
- **Tokens encrypted at rest** with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`); never logged, never returned to Slack.
- **Signed OAuth state.** The `state` parameter is HMAC-SHA256 signed and expires after 10 minutes, so a callback can't be replayed or bound to a different Slack user.
- **Read-only scopes**: `drive.metadata.readonly` and `calendar.readonly`.
- **Minimal Slack scopes**: the bot cannot read channel history, only direct mentions.
- **Audit log stores metadata only** (action, provider, status, truncated query) — never API responses or tokens.
- Google refresh tokens are used transparently; if a refresh fails the user is asked to reconnect.
- If a user lacks access to a resource, the APIs simply don't return it — the bot answers "no results available for your account".

## Project structure

```
src/
├── index.ts            # entrypoint (Socket Mode or HTTP mode)
├── app.ts              # Express OAuth callback routes + health check
├── config/env.ts       # zod-validated environment
├── slack/              # Bolt app, slash commands, app_mention handler
├── ai/                 # intent router (OpenAI/Anthropic) + prompts + orchestrator
├── tools/              # Drive, Calendar, ClickUp (per-user tokens only)
├── oauth/              # Google & ClickUp OAuth flows
├── services/           # users, connections, token refresh, audit log
├── security/           # AES-256-GCM encryption + signed OAuth state
├── db/                 # Prisma client
├── utils/              # timezone-aware dates, Slack formatters
└── types/              # shared types and error classes
```
