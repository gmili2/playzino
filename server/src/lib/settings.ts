import { BOT_LEVELS, type BotLevel } from '../game/engine.js';
import { audit } from './audit.js';
import { prisma } from './prisma.js';

const BOT_LEVEL_KEY = 'botLevel';
export const DEFAULT_BOT_LEVEL: BotLevel = 'EXPERT';

// Lu à chaque coup de robot : gardé en mémoire, relu en base seulement au premier accès.
let botLevelCache: BotLevel | null = null;

export async function getBotLevel(): Promise<BotLevel> {
  if (botLevelCache) return botLevelCache;
  const row = await prisma.setting.findUnique({ where: { key: BOT_LEVEL_KEY } });
  botLevelCache = BOT_LEVELS.includes(row?.value as BotLevel) ? (row!.value as BotLevel) : DEFAULT_BOT_LEVEL;
  return botLevelCache;
}

/** Change le niveau des robots (parties en cours comprises, dès leur prochain coup) et le journalise. */
export async function setBotLevel(level: BotLevel, actorId: string, ip?: string) {
  const previous = await getBotLevel();
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: BOT_LEVEL_KEY }, create: { key: BOT_LEVEL_KEY, value: level }, update: { value: level } });
    await audit({ actorId, action: 'admin.bot_level', targetType: 'setting', targetId: BOT_LEVEL_KEY, details: { from: previous, to: level }, ip }, tx);
  });
  botLevelCache = level;
}
