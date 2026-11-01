export const fmt = (n: number) => n.toLocaleString('en-US');
export const signed = (n: number) => (n > 0 ? '+' : '') + fmt(n);
export const initials = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '؟';

export const COLOR_NAME: Record<string, string> = { blue: 'أزرق', yellow: 'أصفر', red: 'أحمر', green: 'أخضر' };
export const GAME_LABEL: Record<string, string> = { PARCHEESI: 'بارتشيزي', CONNECT4: 'أربعة على التوالي' };
export const COLOR_HEX: Record<string, string> = { blue: '#2F6BFF', yellow: '#F5C21B', red: '#E5484D', green: '#1FB57A' };

const dateFmt = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, numberingSystem: 'latn' });
export const fmtDate = (d: string | number | Date) => dateFmt.format(new Date(d));
const monthFmt = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric', numberingSystem: 'latn' });
export const fmtMonth = (d: string) => monthFmt.format(new Date(d));

export const TX_LABEL: Record<string, string> = {
  SIGNUP_BONUS: 'مكافأة التسجيل',
  DAILY_BONUS: 'عجلة الحظ',
  STAKE: 'رهان طاولة',
  WIN: 'فوز في مباراة',
  REFUND: 'استرداد',
  ADMIN_CREDIT: 'إضافة إدارية',
  ADMIN_DEBIT: 'خصم إداري',
  DEPOSIT: 'إيداع بنكي',
  WITHDRAWAL: 'طلب سحب',
  WITHDRAWAL_REFUND: 'استرجاع سحب مرفوض',
  WHEEL_SPIN: 'دورة عجلة مدفوعة',
  WHEEL_PRIZE: 'ربح العجلة'
};

/** RIB affiché par groupes (banque · ville · compte · clé) pour être recopié sans erreur. */
export const fmtRib = (rib: string) => (rib.length === 24 ? `${rib.slice(0, 3)} ${rib.slice(3, 6)} ${rib.slice(6, 22)} ${rib.slice(22)}` : rib);
