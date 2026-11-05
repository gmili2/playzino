import { prisma } from '../../lib/prisma.js';

/**
 * Moyens de paiement de la plateforme, fixés dans le code : l'admin ne peut ni les modifier ni en ajouter.
 * `kind` : 'rib' = virement bancaire (titulaire + RIB de 24 chiffres) ; 'phone' = transfert vers un numéro de
 * téléphone marocain (champ `rib` = 10 chiffres, titulaire facultatif).
 * Un moyen sans compte complet reste affiché mais n'accepte pas encore de dépôt (« bientôt disponible »).
 * Pour compléter ou changer un compte : modifier cette liste puis redéployer.
 */
export const PAYMENT_METHODS = [
  // Seuls Wafacash et Cash Plus sont proposés : Saham Bank, Simple et Orange Money ont été retirés (désactivés en base au démarrage).
  { id: 'wafacash', name: 'Wafacash', logo: '/payments/wafacash.png', kind: 'rib', accountHolder: 'احمد', rib: '820780261705426339117470' },
  { id: 'cashplus', name: 'Cash Plus', logo: '/payments/cashplus.png', kind: 'phone', accountHolder: '', rib: '0632586771' }
] as const;

export const METHOD_NAMES = PAYMENT_METHODS.map((m) => m.name) as [string, ...string[]];

const isReady = (m: { kind: 'rib' | 'phone'; accountHolder: string; rib: string }) =>
  m.kind === 'phone' ? /^0[5-7]\d{8}$/.test(m.rib) : m.accountHolder.length >= 2 && /^\d{24}$/.test(m.rib);

/** Vue joueur : tous les moyens, avec le compte à créditer seulement quand il est complet. */
export const listPaymentMethods = () =>
  PAYMENT_METHODS.map((m) => {
    const ready = isReady(m);
    return { id: m.id, name: m.name, logo: m.logo, kind: m.kind, available: ready, accountHolder: ready ? m.accountHolder : '', rib: ready ? m.rib : '' };
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
