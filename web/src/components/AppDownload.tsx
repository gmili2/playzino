import { useState } from 'react';
import { IconCrown } from './Icons';

/** Version de l'APK publiée (à augmenter à chaque nouvelle APK, pour que le cache ne serve pas l'ancienne). */
const APK_VERSION = 1;
export const APK_URL = `/download/playzino.apk?v=${APK_VERSION}`;

/** Dans l'application Android, la WebView ajoute « PlayzinoApp » à son user-agent : le bouton y est inutile. */
export const inApp = () => /PlayzinoApp/.test(navigator.userAgent);
type Platform = 'android' | 'ios' | 'desktop';
function platform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="ad-steps">
      {items.map((t, i) => <li key={i}><span>{i + 1}</span>{t}</li>)}
    </ol>
  );
}

export function AppDownloadDialog({ onClose }: { onClose: () => void }) {
  const p = platform();
  return (
    <div className="sp-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ad-title" className="sp-dialog ad-dialog" data-testid="app-dialog" onClick={(e) => e.stopPropagation()}>
        <img src="/icons/icon-192.png" alt="" className="ad-icon" />
        <span id="ad-title" className="sp-title">تطبيق Playzino</span>
        {p === 'android' && (
          <>
            <span className="sp-sub">للهواتف بنظام أندرويد · مجاني</span>
            <a href={APK_URL} download="playzino.apk" className="pb-btn pb-gold" data-testid="apk-link">تحميل التطبيق (APK)</a>
            <Steps items={[
              'اضغط «تحميل التطبيق» وانتظر انتهاء التحميل.',
              'افتح الملف playzino.apk من الإشعارات أو من مجلد التنزيلات.',
              'إذا طلب الهاتف ذلك، اسمح بتثبيت التطبيقات من هذا المصدر (المتصفح).',
              'اضغط «تثبيت» ثم «فتح». ستجد Playzino في شاشة هاتفك.'
            ]} />
            <span className="hint">قد يعرض أندرويد تحذيرًا لأن التطبيق لا يأتي من متجر Google Play.</span>
          </>
        )}
        {p === 'ios' && (
          <>
            <span className="sp-sub">التطبيق متوفر لأندرويد. على آيفون، أضف Playzino إلى شاشتك الرئيسية:</span>
            <Steps items={[
              'افتح الموقع في متصفح Safari.',
              'اضغط زر المشاركة (المربع مع السهم للأعلى).',
              'اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».'
            ]} />
          </>
        )}
        {p === 'desktop' && (
          <>
            <span className="sp-sub">التطبيق مخصص لهواتف أندرويد.</span>
            <Steps items={[
              'افتح playzino.mygympro.club من متصفح هاتفك.',
              'اضغط «تحميل التطبيق» واتبع الخطوات.'
            ]} />
            <a href={APK_URL} download="playzino.apk" className="pb-btn pb-ghost pb-sm">تحميل ملف APK على هذا الجهاز</a>
          </>
        )}
        <button type="button" className="pb-btn pb-plain pb-sm" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}

/** Bandeau de l'accueil « حمّل التطبيق » (caché dans l'application). */
export function AppDownloadBanner() {
  const [open, setOpen] = useState(false);
  if (inApp()) return null;
  return (
    <>
      <section className="panel ad-banner" aria-label="تطبيق Playzino">
        <span className="ad-badge"><IconCrown size={26} /></span>
        <span className="ad-text">
          <b>حمّل تطبيق Playzino</b>
          <small>العب مباشرة من شاشة هاتفك · أندرويد</small>
        </span>
        <button type="button" className="pb-btn pb-gold pb-sm" onClick={() => setOpen(true)} data-testid="app-download">تحميل التطبيق</button>
      </section>
      {open && <AppDownloadDialog onClose={() => setOpen(false)} />}
    </>
  );
}
