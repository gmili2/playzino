/** Client HTTP de l'API : cookies de session inclus, erreurs normalisées. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, string[]>) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'X-Requested-With': 'parcheesi',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_' + res.status, e?.message ?? 'تعذّر الاتصال بالخادم', e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body)
};

/** Messages d'erreur affichés à l'utilisateur (interface en arabe). */
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'بيانات الدخول غير صحيحة',
  ACCOUNT_SUSPENDED: 'هذا الحساب موقوف',
  EMAIL_TAKEN: 'هذا البريد الإلكتروني مستخدم بالفعل',
  USERNAME_TAKEN: 'اسم المستخدم هذا محجوز',
  VALIDATION_ERROR: 'تحقق من الحقول المدخلة',
  INSUFFICIENT_FUNDS: 'رصيدك غير كافٍ',
  ROOM_FULL: 'هذه الطاولة مكتملة',
  ROOM_NOT_WAITING: 'هذه الطاولة لم تعد تقبل لاعبين',
  ALREADY_IN_ROOM: 'أنت بالفعل على طاولة أخرى',
  NOT_FOUND: 'غير موجود',
  NOT_YOUR_TURN: 'ليس دورك',
  ILLEGAL_MOVE: 'حركة غير مسموحة',
  GAME_PAUSED: 'المباراة متوقفة مؤقتًا',
  GAME_OVER: 'انتهت المباراة',
  ALREADY_CLAIMED: 'استلمت مكافأة اليوم بالفعل',
  ALREADY_SPUN: 'لقد أدرت العجلة اليوم، عد غدًا',
  BAD_WHEEL: 'إعدادات العجلة غير صالحة',
  TOO_MANY_REQUESTS: 'محاولات كثيرة، أعد المحاولة لاحقًا',
  WRONG_PASSWORD: 'كلمة المرور الحالية غير صحيحة',
  UNAUTHORIZED: 'يجب تسجيل الدخول',
  FORBIDDEN: 'غير مسموح',
  SELF_SUSPEND: 'لا يمكنك إيقاف حسابك',
  TARGET_IS_ADMIN: 'لا يمكن إيقاف مسؤول',
  BAD_RECEIPT: 'الوصل يجب أن يكون صورة (JPG أو PNG أو WEBP) أو ملف PDF',
  RECEIPT_TOO_LARGE: 'حجم الوصل كبير جدًا (5 ميغابايت كحد أقصى)',
  BANK_UNAVAILABLE: 'هذا البنك غير متاح حاليًا',
  TOO_MANY_PENDING: 'لديك طلبات إيداع قيد المراجعة، انتظر معالجتها',
  ALREADY_REVIEWED: 'تمت معالجة هذا الطلب بالفعل'
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? e.message;
  if (e && typeof e === 'object' && 'code' in e) return MESSAGES[String((e as { code: string }).code)] ?? 'حدث خطأ';
  return 'تعذّر الاتصال بالخادم';
}

/** Erreurs de validation zod → messages par champ (première erreur). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !e.details) return {};
  return Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0]]));
}
