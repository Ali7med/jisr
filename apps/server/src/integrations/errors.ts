/**
 * خطأ قادم من تكامل، برسالة عربية جاهزة للعرض (القاعدة الحاكمة 4).
 *
 * كل تكامل يترجم أكواد شركته إلى هذا النوع، فالمسارات تعرض `message`
 * ولا تفسّر أكواد أي شركة — ولا يتسرّب اسم شركة إلى الواجهة.
 */

/** تصنيف عامّ للخطأ — يسمح للطبقات الأعلى بالتصرّف بلا معرفة الشركة. */
export type IntegrationErrorKind =
  /** اعتمادات خاطئة أو توقيع فاسد. */
  | 'credentials'
  /** جلسة/توكن منتهٍ — قابل للإصلاح بإعادة المصادقة. */
  | 'auth'
  /** صلاحية مرفوضة أو إعداد ناقص في لوحة الشركة. */
  | 'permission'
  /** تجاوز حصة أو حدّ معدّل. */
  | 'quota'
  /** الجهاز غير متصل أو لا يدعم الأمر. */
  | 'device'
  /** مشكلة شبكة. */
  | 'network'
  | 'unknown';

export interface IntegrationErrorOptions {
  /** أي تكامل رماها — `tuya` مثلاً. */
  readonly integrationId?: string;
  /** كود الخطأ الأصلي من الشركة، للتشخيص لا للعرض. */
  readonly code?: string | number;
  /** نص الخطأ الأصلي (إنجليزي غالباً)، للسجلّ لا للعرض. */
  readonly rawMessage?: string;
  readonly kind?: IntegrationErrorKind;
}

/** لا نستخدم «خصائص المعامل»: Node يشغّل TypeScript بحذف الأنواع فقط. */
export class IntegrationError extends Error {
  readonly integrationId: string | undefined;
  readonly code: string | number | undefined;
  readonly rawMessage: string | undefined;
  readonly kind: IntegrationErrorKind;

  constructor(message: string, options: IntegrationErrorOptions = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.integrationId = options.integrationId;
    this.code = options.code;
    this.rawMessage = options.rawMessage;
    this.kind = options.kind ?? 'unknown';
  }

  /** هل يُجدي إعادة المحاولة بعد تجديد المصادقة؟ */
  get isAuthProblem(): boolean {
    return this.kind === 'auth';
  }

  static network(detail?: string, integrationId?: string): IntegrationError {
    return new IntegrationError('تعذّر الاتصال بخوادم الشركة. حاول بعد قليل.', {
      integrationId,
      rawMessage: detail,
      kind: 'network',
    });
  }
}

/**
 * رمز HTTP لكل تصنيف — يُبقي ترجمة الأخطاء في مكان واحد بدل تكرارها
 * في كل مسار.
 */
export function statusForKind(kind: IntegrationErrorKind): number {
  switch (kind) {
    case 'credentials':
    case 'auth':
      return 401;
    case 'permission':
      return 403;
    case 'quota':
      return 429;
    case 'device':
      return 409;
    case 'network':
      return 502;
    default:
      return 502;
  }
}
