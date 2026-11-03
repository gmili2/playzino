import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Robots : comptes système créés à la demande, sans mot de passe utilisable. Ils portent des pseudos de joueurs
 * ordinaires ; à chaque partie, des robots différents sont tirés au hasard dans la liste.
 * `legacy` : ancien pseudo « Robot_… » renommé au premier usage.
 */
const BOTS = [
  { key: 1, username: 'Nour_23', color: '#E5484D', legacy: 'Robot_Nour' },
  { key: 2, username: 'Sami.k', color: '#1FB57A', legacy: 'Robot_Sami' },
  { key: 3, username: 'Lina_ma', color: '#F5C21B', legacy: 'Robot_Lina' },
  { key: 4, username: 'Yassine_99', color: '#2F6BFF' },
  { key: 5, username: 'Salma.b', color: '#C084FC' },
  { key: 6, username: 'Hamza10', color: '#F97316' },
  { key: 7, username: 'Imane_K', color: '#EC4899' },
  { key: 8, username: 'Othmane07', color: '#14B8A6' },
  { key: 9, username: 'Khadija22', color: '#A3E635' },
  { key: 10, username: 'Anas_Pro', color: '#38BDF8' },
  { key: 11, username: 'Meryem.z', color: '#FB7185' },
  { key: 12, username: 'Ayoub_16', color: '#FACC15' },
  { key: 13, username: 'Zineb', color: '#818CF8' },
  { key: 14, username: 'Reda_MA', color: '#22C55E' },
  { key: 15, username: 'Hajar_x', color: '#F472B6' },
  { key: 16, username: 'Mehdi.21', color: '#60A5FA' }
];

const isTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Robots tirés au hasard (sans doublon) pour une partie. */
export async function ensureBots(count: number): Promise<string[]> {
  const pool = [...BOTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ids: string[] = [];
  for (const bot of pool.slice(0, count)) ids.push(await ensureBot(bot));
  return ids;
}

async function ensureBot(bot: (typeof BOTS)[number]): Promise<string> {
  const email = `bot-${bot.key}@bots.playzino.local`;
  const names = [bot.username, `${bot.username}_${randomBytes(2).toString('hex')}`];
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, username: true } });
  if (existing) {
    if (bot.legacy && existing.username.startsWith(bot.legacy)) {
      for (const username of names) {
        try {
          await prisma.user.update({ where: { id: existing.id }, data: { username } });
          break;
        } catch (e) {
          if (!isTaken(e)) throw e; // pseudo pris par un joueur : on garde l'ancien plutôt que d'échouer
        }
      }
    }
    return existing.id;
  }
  // Mot de passe aléatoire jamais communiqué + refus explicite à la connexion (isBot).
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  for (const username of names) {
    try {
      const user = await prisma.user.create({
        data: {
          email, username, passwordHash, isBot: true,
          profile: { create: { avatarColor: bot.color } },
          wallet: { create: { balance: 0 } }
        },
        select: { id: true }
      });
      return user.id;
    } catch (e) {
      if (!isTaken(e)) throw e;
      // Nom déjà pris par un joueur ou robot créé en parallèle : on relit, sinon on tente un autre nom.
      const again = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (again) return again.id;
    }
  }
  throw new Error('Impossible de créer le robot');
}
