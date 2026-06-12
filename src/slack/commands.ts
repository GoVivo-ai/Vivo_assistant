import type { App } from '@slack/bolt';
import { signState } from '../security/encryption';
import { getGoogleAuthUrl } from '../oauth/googleOAuth';
import { getClickUpAuthUrl } from '../oauth/clickupOAuth';
import { getUser } from '../services/userService';
import { deleteConnections, listConnections } from '../services/connectionService';
import { HELP_TEXT } from '../utils/formatters';
import type { ProviderName } from '../types';

const COMMAND_ERROR_TEXT =
  'Something went wrong running that command. Please try again in a moment.';

export function registerCommands(app: App): void {
  app.command('/vivo-help', async ({ ack, respond }) => {
    await ack();
    await respond({ response_type: 'ephemeral', text: HELP_TEXT });
  });

  app.command('/vivo-connect', async ({ ack, respond, command }) => {
    await ack();
    try {
      const base = { slackUserId: command.user_id, slackTeamId: command.team_id };
      const googleUrl = getGoogleAuthUrl(signState({ ...base, provider: 'google' }));
      const clickupUrl = getClickUpAuthUrl(signState({ ...base, provider: 'clickup' }));

      await respond({
        response_type: 'ephemeral',
        text: 'Connect your accounts to Vivo Assistant',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                '*Connect your accounts*\n' +
                'Vivo Assistant only accesses data using *your own* credentials. ' +
                'Connect the tools you want to use:',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Connect Google Drive & Calendar' },
                url: googleUrl,
                style: 'primary',
                action_id: 'connect_google',
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Connect ClickUp' },
                url: clickupUrl,
                action_id: 'connect_clickup',
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Links expire in 10 minutes. Run `/vivo-connect` again if needed.',
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('[commands] /vivo-connect failed:', (err as Error).message);
      await respond({ response_type: 'ephemeral', text: COMMAND_ERROR_TEXT });
    }
  });

  app.command('/vivo-whoami', async ({ ack, respond, command }) => {
    await ack();
    try {
      const user = await getUser(command.user_id, command.team_id);
      const connections = user ? await listConnections(user.id) : [];

      if (connections.length === 0) {
        await respond({
          response_type: 'ephemeral',
          text: 'You have no connected accounts yet. Use `/vivo-connect` to get started.',
        });
        return;
      }

      const sections: string[] = ['*Connected accounts:*'];
      const google = connections.find((c) => c.provider === 'google');
      const clickup = connections.find((c) => c.provider === 'clickup');

      if (google) {
        sections.push(
          [
            '*Google*',
            `• Email: ${google.providerEmail ?? 'unknown'}`,
            `• Scopes: ${summarizeScopes(google.scopes)}`,
            '• Status: Connected',
          ].join('\n'),
        );
      } else {
        sections.push('*Google*\n• Status: Not connected');
      }

      if (clickup) {
        sections.push(
          [
            '*ClickUp*',
            `• Account: ${clickup.providerEmail ?? clickup.providerAccountId ?? 'unknown'}`,
            '• Status: Connected',
          ].join('\n'),
        );
      } else {
        sections.push('*ClickUp*\n• Status: Not connected');
      }

      await respond({ response_type: 'ephemeral', text: sections.join('\n\n') });
    } catch (err) {
      console.error('[commands] /vivo-whoami failed:', (err as Error).message);
      await respond({ response_type: 'ephemeral', text: COMMAND_ERROR_TEXT });
    }
  });

  app.command('/vivo-disconnect', async ({ ack, respond, command }) => {
    await ack();
    try {
      const user = await getUser(command.user_id, command.team_id);
      if (!user) {
        await respond({
          response_type: 'ephemeral',
          text: 'You have no connected accounts to remove.',
        });
        return;
      }

      const arg = command.text.trim().toLowerCase();
      const provider: ProviderName | undefined =
        arg === 'google' || arg === 'clickup' ? arg : undefined;

      const removed = await deleteConnections(user.id, provider);
      if (removed === 0) {
        await respond({
          response_type: 'ephemeral',
          text: provider
            ? `You have no ${provider} connection to remove.`
            : 'You have no connected accounts to remove.',
        });
        return;
      }

      await respond({
        response_type: 'ephemeral',
        text: provider
          ? `Your ${provider === 'google' ? 'Google' : 'ClickUp'} connection has been removed.`
          : 'Your connected accounts have been removed.',
      });
    } catch (err) {
      console.error('[commands] /vivo-disconnect failed:', (err as Error).message);
      await respond({ response_type: 'ephemeral', text: COMMAND_ERROR_TEXT });
    }
  });

  // URL buttons still emit an action event that must be acked to avoid a warning.
  app.action('connect_google', async ({ ack }) => ack());
  app.action('connect_clickup', async ({ ack }) => ack());
}

function summarizeScopes(scopes: string | null): string {
  if (!scopes) return 'unknown';
  const labels: string[] = [];
  if (scopes.includes('drive')) labels.push('Drive readonly');
  if (scopes.includes('calendar')) labels.push('Calendar readonly');
  if (labels.length === 0) labels.push('basic profile');
  return labels.join(', ');
}
