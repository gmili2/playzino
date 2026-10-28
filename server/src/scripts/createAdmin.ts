import '../prisma-engine.js';
import { prisma } from '../lib/prisma.js';
import { ensureAdminFromEnv } from './adminAccount.js';

const id = await ensureAdminFromEnv();
console.log(id ? `Administrateur prêt (id ${id})` : 'ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD non définis');
await prisma.$disconnect();
