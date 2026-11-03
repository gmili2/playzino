import { useState } from 'react';
import { fmt } from '../lib/format';

/** Numéro de compte affiché au joueur : 8 derniers caractères de son identifiant (l'admin le retrouve par la recherche). */
export const accountNo = (userId: string) => userId.slice(-8).toUpperCase();

/**
 * Carte « رصيدك الحالي » (visuel doré fourni pour le design) : le solde et le numéro de compte sont posés sur les cases
 * vides de l'image, en pourcentages de sa taille (1593 × 859) pour suivre tous les écrans.
 */
export function WalletCard({ userId, balance }: { userId: string; balance: number }) {
  const [copied, setCopied] = useState(false);
  const no = accountNo(userId);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(no);
    } catch {
      /* presse-papiers indisponible */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="wallet-card" role="group" aria-label={`رصيدك الحالي ${fmt(balance)} درهم، رقم الحساب ${no}`}>
      <img src="/img/wallet-card.webp" alt="" width={1200} height={647} />
      <b className="wallet-card-balance" data-testid="wallet-balance">{fmt(balance)}</b>
      <span className="wallet-card-account" data-testid="wallet-account">{no}</span>
      <button type="button" className="wallet-card-copy" onClick={copy} aria-label="نسخ رقم الحساب" title="نسخ رقم الحساب" />
      {copied && <span className="wallet-card-copied" role="status">تم النسخ ✓</span>}
    </div>
  );
}
