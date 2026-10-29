import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/** Robots d'entraînement : comptes système créés à la demande, sans mot de passe utilisable. */
const BOTS = [
  { key: 1, username: 'Robot_Nour', color: '#E5484D' },
  { key: 2, username: 'Robot_Sami', color: '#1FB57A' },
  { key: 3, username: 'Robot_Lina', color: '#F5C21B' }
];

export async function ensureBots(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (const bot of BOTS.slice(0, count)) {
    const email = `bot-${bot.key}@bots.playzino.local`;
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      // Mot de passe aléatoire jamais communiqué + refus explicite à la connexion (isBot).
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      for (const username of [bot.username, `${bot.username}_${randomBytes(2).toString('hex')}`]) {
        try {
          user = await prisma.user.create({
            data: {
              email, username, passwordHash, isBot: true,
              profile: { create: { avatarColor: bot.color } },
              wallet: { create: { balance: 0 } }
            },
            select: { id: true }
          });
          break;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          // Nom déjà pris par un joueur ou créé en parallèle : on relit, sinon on tente un autre nom.
          user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (user) break;
        }
      }
      if (!user) throw new Error('Impossible de créer le robot');
    }
    ids.push(user.id);
  }
  return ids;
}
