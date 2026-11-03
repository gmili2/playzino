import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../lib/format';
import type { GameType } from '../lib/types';
import { Coin } from './ui';

/** Mises proposées (partie rapide et création de table). 0 = partie gratuite. */
export const STAKES = [0, 5, 10, 15, 20, 30, 40, 50, 100];
export const stakeLabel = (s: number) => (s === 0 ? 'مجانية' : String(s));

export interface QuickChoice { maxPlayers: number; gameType: GameType; title: string }

/** Fenêtre « اختر الرهان » ouverte par les boutons « العب » avant de lancer la recherche d'adversaire. */
export function StakePicker({ choice, balance, busy, onPick, onClose }: {
  choice: QuickChoice | null; balance: number; busy: boolean; onPick: (stake: number) => void; onClose: () => void;
}) {
  useEffect(() => {
    if (!choice) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choice, onClose]);
  if (!choice) return null;
  const short = STAKES.some((s) => s > balance);
  return (
    <div className="sp-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="sp-title" className="sp-dialog" data-testid="stake-picker" onClick={(e) => e.stopPropagation()}>
        <span id="sp-title" className="sp-title">اختر الرهان</span>
        <span className="sp-sub">{choice.title} · الفائز يربح رهانات الجميع</span>
        <div className="sp-grid">
          {STAKES.map((s) => (
            <button key={s} type="button" className={'sp-opt' + (s === 0 ? ' free' : '')} data-testid={`stake-${s}`} disabled={busy || s > balance} onClick={() => onPick(s)}>
              {s === 0 ? <b>مجانية</b> : <><Coin size={22} /><b dir="ltr">{fmt(s)}</b></>}
              <small>{s === 0 ? 'بدون رهان' : s > balance ? 'رصيد غير كافٍ' : 'عملة'}</small>
            </button>
          ))}
        </div>
        <span className="sp-balance">رصيدك: <b dir="ltr">{fmt(balance)}</b>{short && <> · <Link to="/cashier" onClick={onClose}>إيداع</Link></>}</span>
        <button type="button" className="pb-btn pb-plain pb-sm" onClick={onClose}>إلغاء</button>
      </div>
    </div>
  );
}
