import { prisma } from '../../lib/prisma.js';

/**
 * Moyens de paiement de la plateforme, fixés dans le code : l'admin ne peut ni les modifier ni en ajouter.
 * Un moyen sans titulaire ni RIB reste affiché mais n'accepte pas encore de dépôt (« bientôt disponible »).
 * Pour compléter ou changer un compte : modifier cette liste puis redéployer.
 */
export const PAYMENT_METHODS = [
  { id: 'saham', name: 'Saham Bank', logo: '/payments/saham.png', accountHolder: 'Alaedin', rib: '' },
  { id: 'wafacash', name: 'Wafacash', logo: '/payments/wafacash.png', accountHolder: 'AHMED', rib: '820780261705426339117470' },
  { id: 'cashplus', name: 'Cash Plus', logo: '/payments/cashplus.png', accountHolder: '', rib: '' },
  { id: 'simple', name: 'Simple', logo: '/payments/simple.png', accountHolder: '', rib: '' },
  { id: 'orange-money', name: 'Orange Money', logo: '/payments/orange-money.png', accountHolder: '', rib: '' }
] as const;

export const METHOD_NAMES = PAYMENT_METHODS.map((m) => m.name) as [string, ...string[]];

const isReady = (m: { accountHolder: string; rib: string }) => m.accountHolder.length >= 2 && /^\d{24}$/.test(m.rib);

/** Vue joueur : tous les moyens, avec le compte à créditer seulement quand il est complet. */
export const listPaymentMethods = () =>
  PAYMENT_METHODS.map((m) => {
    const ready = isReady(m);
    return { id: m.id, name: m.name, logo: m.logo, available: ready, accountHolder: ready ? m.accountHolder : '', rib: ready ? m.rib : '' };
  });

/**
 * Recopie la liste dans la table PaymentBank (les dépôts y restent rattachés) au démarrage.
 * Tout compte qui n'en fait pas partie, par exemple ajouté avant par l'admin, est désactivé.
 */
export async function syncPaymentMethods() {
  await prisma.$transaction([
    ...PAYMENT_METHODS.map((m) => {
      const data = { name: m.name, accountHolder: m.accountHolder, rib: m.rib, active: isReady(m) };
      return prisma.paymentBank.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
    }),
    prisma.paymentBank.updateMany({ where: { id: { notIn: PAYMENT_METHODS.map((m) => m.id) }, active: true }, data: { active: false } })
  ]);
}
