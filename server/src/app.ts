import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { loadUser, requireCsrfHeader } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { gamesRouter } from './modules/games/games.routes.js';
import { roomsRouter } from './modules/rooms/rooms.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';
import { meRouter } from './modules/users/users.routes.js';
import { walletRouter } from './modules/wallet/wallet.routes.js';
import { prisma } from './lib/prisma.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:']
        }
      }
    })
  );

  const origins = config.CORS_ORIGIN.split(',');
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return void res.status(204).end();
    next();
  });

  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  });

  app.use('/api', requireCsrfHeader, loadUser);
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', notFoundHandler);

  // En production, le serveur sert aussi le frontend compilé (SPA).
  const webDist = config.WEB_DIST ?? resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
