import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { gameManager } from './realtime/gameManager.js';
import { hub } from './realtime/hub.js';
import { createSocketServer } from './realtime/socket.js';
import { ensureAdminFromEnv } from './scripts/adminAccount.js';

async function main() {
  await prisma.$connect();
  await ensureAdminFromEnv();
  gameManager.setBroadcaster(hub);
  const http = createServer(createApp());
  const io = createSocketServer(http);
  const recovered = await gameManager.recoverActiveGames();
  http.listen(config.PORT, () => {
    console.log(`Parcheesi Online — API et Socket.IO sur http://localhost:${config.PORT} (${recovered} partie(s) reprise(s))`);
  });

  const stop = async () => {
    console.log('Arrêt en cours…');
    gameManager.shutdown();
    io.close();
    http.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
