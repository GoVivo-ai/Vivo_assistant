import { env } from './config/env';
import { createStandaloneServer, registerOAuthRoutes } from './app';
import { isSocketMode, receiver, slackApp } from './slack/slackApp';
import { registerCommands } from './slack/commands';
import { registerEvents } from './slack/events';
import { prisma } from './db/prisma';

async function main(): Promise<void> {
  await prisma.$connect();

  registerCommands(slackApp);
  registerEvents(slackApp);

  if (isSocketMode) {
    // Slack events arrive over the websocket; HTTP server only serves OAuth callbacks.
    const httpServer = createStandaloneServer();
    httpServer.listen(env.PORT, () => {
      console.log(`⚡ OAuth/HTTP server listening on port ${env.PORT}`);
    });
    await slackApp.start();
    console.log('⚡ Vivo Assistant connected to Slack (Socket Mode)');
  } else {
    // Single HTTP server: Slack events at /slack/events + OAuth callbacks.
    registerOAuthRoutes(receiver!.router);
    await slackApp.start(env.PORT);
    console.log(`⚡ Vivo Assistant listening on port ${env.PORT} (HTTP mode)`);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
