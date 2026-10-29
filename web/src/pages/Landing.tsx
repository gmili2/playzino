import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Board, SHOWCASE_PAWNS } from '../components/Board';
import { IconBolt, IconCrown, IconShield, IconTrophy, IconUser, IconUsers, Logo } from '../components/Icons';
import { api } from '../lib/api';
import { fmt } from '../lib/format';

/**
 * Page d'accueil des visiteurs (non connectés) : ambiance « nuit orientale » violet et or.
 * Tous les visuels sont dessinés en CSS/SVG ; le plateau est le vrai composant du jeu.
 */

function Stars() {
  // Positions fixes (pas d'aléatoire au rendu) pour un ciel stable.
  const stars = [
    [6, 12, 2], [14, 30, 1], [22, 8, 2], [31, 22, 1], [40, 6, 1], [48, 18, 2], [57, 10, 1], [66, 26, 1],
    [74, 5, 2], [82, 16, 1], [90, 9, 2], [95, 28, 1], [10, 44, 1], [36, 38, 1], [62, 42, 1], [86, 40, 1]
  ];
  return (
    <div className="ld-stars" aria-hidden="true">
      {stars.map(([x, y, s], i) => (
        <span key={i} style={{ left: `${x}%`, top: `${y}%`, width: s * 2, height: s * 2, animationDelay: `${(i % 5) * 0.7}s` }} />
      ))}
    </div>
  );
}

function Arch() {
  // Arche outrepassée stylisée qui encadre le plateau.
  return (
    <svg className="ld-arch" viewBox="0 0 400 460" aria-hidden="true">
      <defs>
        <linearGradient id="ldArchGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#B87400" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <path d="M30 460V200C30 95 110 20 200 20s170 75 170 180v260" fill="none" stroke="url(#ldArchGold)" strokeWidth="3" />
      <path d="M58 460V206C58 116 124 52 200 52s142 64 142 154v254" fill="none" stroke="url(#ldArchGold)" strokeWidth="1.2" strokeDasharray="2 7" />
      <circle cx="200" cy="20" r="6" fill="#FFC83D" />
    </svg>
  );
}

function Lantern({ className }: { className: string }) {
  return (
    <svg className={'ld-lantern ' + className} viewBox="0 0 40 90" aria-hidden="true">
      <line x1="20" y1="0" x2="20" y2="18" stroke="#B87400" strokeWidth="1.5" />
      <path d="M12 18h16l4 10H8z" fill="#8A5A12" />
      <path d="M8 28h24l-3 34H11z" fill="#FFB21E" opacity="0.92" />
      <path d="M14 32h12l-2 26h-8z" fill="#FFF3C4" opacity="0.9" />
      <path d="M11 62h18l-4 8H15z" fill="#8A5A12" />
      <circle cx="20" cy="45" r="16" fill="#FFC83D" opacity="0.18" />
    </svg>
  );
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function Dice({ face, className }: { face: number; className: string }) {
  return (
    <div className={'ld-dice ' + className} aria-hidden="true">
      {Array.from({ length: 9 }, (_, k) => <span key={k} style={{ opacity: PIPS[face].includes(k) ? 1 : 0 }} />)}
    </div>
  );
}

function ModeCard({ icon, tone, title, text }: { icon: ReactNode; tone: string; title: string; text: string }) {
  return (
    <article className="ld-mode" style={{ ['--tone' as string]: tone }}>
      <span className="ld-mode-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export function LandingPage() {
  const [online, setOnline] = useState<number | null>(null);
  const [openTables, setOpenTables] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ online: number }>('/api/stats').then((s) => setOnline(s.online)).catch(() => {});
    api.get<{ items: { status: string }[] }>('/api/rooms?status=WAITING').then((r) => setOpenTables(r.items.length)).catch(() => {});
  }, []);

  return (
    <div className="ld">
      <section className="ld-hero">
        <Stars />
        <div className="ld-moon" aria-hidden="true" />
        <Lantern className="ld-lantern-a" />
        <Lantern className="ld-lantern-b" />

        <header className="ld-top">
          <Link to="/" className="ld-brand" aria-label="Parcheesi Online">
            <Logo size={40} />
            <span dir="ltr">Parcheesi <b>Online</b></span>
          </Link>
          <nav className="ld-top-actions">
            <Link className="ld-ghost" to="/rules">القواعد</Link>
            <Link className="ld-ghost" to="/login"><IconUser size={16} />تسجيل الدخول</Link>
          </nav>
        </header>

        <div className="ld-hero-grid">
          <div className="ld-copy">
            <span className="ld-badge"><IconShield size={15} />عملات افتراضية فقط · بلا أموال حقيقية</span>
            <h1>
              <span className="ld-h1-a">العب</span>
              <span className="ld-h1-b">بارتشيسي</span>
            </h1>
            <p className="ld-sub">وتحدَّ أصدقاءك من كل مكان، من لاعبَين إلى أربعة لاعبين، مباشرة من المتصفح.</p>

            <div className="ld-pillbox">
              <span><IconUsers size={22} />لاعبون<br />حقيقيون</span>
              <span><IconBolt size={22} />مباريات<br />سريعة</span>
              <span><IconShield size={22} />نرد عادل<br />من الخادم</span>
            </div>

            <div className="ld-cta-row">
              <Link className="ld-cta" to="/register" data-testid="landing-cta">
                ابدأ الآن
                <span className="ld-cta-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                </span>
              </Link>
              <span className="ld-cta-note">1,000 عملة هدية عند التسجيل</span>
            </div>

            <div className="ld-live" role="status">
              <span className="ld-live-dot" />
              {online ? <><b dir="ltr">{fmt(online)}</b> متصل الآن</> : 'المنصة تعمل الآن'}
              {!!openTables && <><span className="ld-sep">·</span><b dir="ltr">{openTables}</b> طاولة تنتظر لاعبين</>}
            </div>
          </div>

          <div className="ld-stage" aria-hidden="true">
            <Arch />
            <div className="ld-board-glow" />
            <div className="ld-board">
              <Board pawns={SHOWCASE_PAWNS} label="لوحة توضيحية" />
            </div>
            <IconCrown size={58} className="ld-crown" />
            <Dice face={5} className="ld-dice-a" />
            <Dice face={6} className="ld-dice-b" />
          </div>
        </div>
      </section>

      <section className="ld-modes" aria-label="أنماط اللعب">
        <ModeCard tone="#8B5CF6" icon={<IconBolt size={40} />} title="لعب سريع" text="نقرة واحدة وتجد طاولة عامة بالرهان الذي تختاره." />
        <ModeCard tone="#FFC83D" icon={<IconTrophy size={40} />} title="ترتيب ومكافآت" text="تصدّر ترتيب الأسبوع واستلم 200 عملة مجانًا كل يوم." />
        <ModeCard tone="#22D3EE" icon={<IconUsers size={40} />} title="لعب مع الأصدقاء" text="أنشئ طاولة خاصة وشارك رمز الدعوة PRC-XXXX." />
      </section>

      <section className="ld-strip" aria-label="المزايا">
        <span><IconUsers size={26} /><b>من 2 إلى 4 لاعبين</b><small>طاولات على مقاسك</small></span>
        <span><IconShield size={26} /><b>لعب نزيه</b><small>كل رمية يتحقق منها الخادم</small></span>
        <span><IconBolt size={26} /><b>إعادة الاتصال</b><small>60 ثانية للعودة إلى مباراتك</small></span>
        <span><IconCrown size={26} /><b>بلا أموال حقيقية</b><small>عملات افتراضية للمتعة فقط</small></span>
      </section>

      <section className="ld-exp">
        <div className="ld-phones" aria-hidden="true">
          <div className="ld-phone ld-phone-main">
            <div className="ld-phone-notch" />
            <div className="ld-phone-screen">
              <Board pawns={SHOWCASE_PAWNS} label="لوحة توضيحية" />
              <div className="ld-phone-dice"><Dice face={3} className="ld-dice-sm" /><Dice face={6} className="ld-dice-sm" /></div>
            </div>
          </div>
          <div className="ld-phone ld-phone-side">
            <div className="ld-phone-notch" />
            <div className="ld-phone-list">
              {['#E5484D', '#F5C21B', '#1FB57A', '#2F6BFF'].map((c, i) => (
                <div key={c} className="ld-phone-row">
                  <span style={{ background: c }} />
                  <i style={{ width: `${70 - i * 12}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="ld-exp-copy">
          <span className="ld-kicker">عالم البارتشيزي بين يديك</span>
          <h2>تجربة لعب<br /><span>متكاملة وممتعة</span></h2>
          <ul>
            <li>تصميم عصري يعمل على الهاتف والحاسوب بدون تحميل</li>
            <li>طاولات خاصة مع الأصدقاء برمز دعوة</li>
            <li>ترتيب اللاعبين، سجل مبارياتك ومحفظتك</li>
          </ul>
          <Link className="ld-cta ld-cta-sm" to="/register">أنشئ حسابك مجانًا</Link>
        </div>
      </section>

      <footer className="ld-foot">
        <nav>
          <Link to="/rules">قواعد اللعب</Link>
          <Link to="/tables">الطاولات</Link>
          <Link to="/login">تسجيل الدخول</Link>
        </nav>
        <p>العملات افتراضية: تُكسب باللعب فقط، لا قيمة مالية لها، ولا يمكن شراؤها أو سحبها.</p>
        <p dir="ltr">© {new Date().getFullYear()} Parcheesi Online</p>
      </footer>
    </div>
  );
}
