/** Stickers envoyables pendant une partie (même liste que STICKERS dans server/src/realtime/socket.ts). */
export const STICKERS = [
  { id: 'laugh', emoji: '😂' },
  { id: 'cool', emoji: '😎' },
  { id: 'angry', emoji: '😡' },
  { id: 'cry', emoji: '😭' },
  { id: 'clap', emoji: '👏' },
  { id: 'fire', emoji: '🔥' },
  { id: 'shock', emoji: '😱' },
  { id: 'love', emoji: '😍' },
  { id: 'good_luck', text: 'بالتوفيق' },
  { id: 'bravo', text: 'برافو!' },
  { id: 'wow', text: 'يا سلام!' },
  { id: 'hurry', text: 'أسرع شوية!' },
  { id: 'thanks', text: 'شكرًا' },
  { id: 'gg', text: 'مباراة حلوة 🤝' }
] as const;

export type StickerId = (typeof STICKERS)[number]['id'];
export const STICKER_BY_ID = Object.fromEntries(STICKERS.map((s) => [s.id, s])) as Record<StickerId, (typeof STICKERS)[number]>;
/** Doit rester aligné sur STICKER_COOLDOWN_MS côté serveur. */
export const STICKER_COOLDOWN_MS = 3000;
