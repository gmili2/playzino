import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { IconChat, IconHeadset, IconMail, IconPhone } from './Icons';

type Support = { phone: string; email: string };

/** 06… ou +2126… → 2126… (format de wa.me). */
const intl = (phone: string) => (phone.startsWith('+') ? phone.slice(1) : '212' + phone.slice(1));
const pretty = (phone: string) => (phone.startsWith('+') ? phone : phone.replace(/(\d{2})(?=\d)/g, '$1 '));

/**
 * Bouton « الدعم » flottant : WhatsApp, appel et e-mail du support, réglés par l'admin (الإعدادات → الدعم).
 * Caché pendant une partie (le bas de l'écran sert aux commandes) et tant qu'aucun contact n'est réglé.
 */
export function SupportButton() {
  const { pathname } = useLocation();
  const [support, setSupport] = useState<Support | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get<Support>('/api/support').then(setSupport, () => setSupport(null)); }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (pathname.startsWith('/room/') || pathname.startsWith('/admin') || !support || (!support.phone && !support.email)) return null;

  const row = (href: string, icon: JSX.Element, title: string, sub: string, color: string) => (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="rl-support-row">
      <span className="rl-support-ico" style={{ background: color }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><b>{title}</b><span dir="ltr" className="rl-support-sub">{sub}</span></span>
    </a>
  );

  return (
    <>
      <button type="button" className="rl-support-fab" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} data-testid="support-button">
        <IconHeadset size={22} /><span>الدعم</span>
      </button>
      {open && (
        <div className="rl-support-back" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="الدعم" className="panel rl-support-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title"><IconHeadset size={22} style={{ color: '#FFC83D' }} />تواصل مع الدعم</h2>
            <p className="hint" style={{ margin: '0 0 12px' }}>سؤال حول إيداع أو سحب أو مباراة؟ فريق الدعم يجيبك.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {support.phone && row(`https://wa.me/${intl(support.phone)}?text=${encodeURIComponent('السلام عليكم، أحتاج مساعدة في Playzino')}`, <IconChat size={20} />, 'واتساب', pretty(support.phone), '#25D366')}
              {support.phone && row(`tel:${support.phone}`, <IconPhone size={20} />, 'اتصال', pretty(support.phone), '#3B82F6')}
              {support.email && row(`mailto:${support.email}`, <IconMail size={20} />, 'البريد الإلكتروني', support.email, '#A855F7')}
            </div>
            <button type="button" className="pb-btn pb-plain" style={{ marginTop: 14, width: '100%' }} onClick={() => setOpen(false)}>إغلاق</button>
          </div>
        </div>
      )}
    </>
  );
}
