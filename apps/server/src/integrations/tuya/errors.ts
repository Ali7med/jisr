import { IntegrationError, type IntegrationErrorKind } from '../errors.ts';
import { TUYA_ID } from './config.ts';

/** ترجمة أكواد خطأ Tuya إلى رسائل عربية تشرح ما العمل. */
export function tuyaError(code: number | undefined, message: string | undefined): IntegrationError {
  return new IntegrationError(messageFor(code, message), {
    integrationId: TUYA_ID,
    code,
    rawMessage: message,
    kind: kindFor(code),
  });
}

export function tuyaNetworkError(detail: string | undefined): IntegrationError {
  return IntegrationError.network(detail, TUYA_ID);
}

/** استجابة لا نفهم شكلها — نقولها صريحة بدل ابتلاعها. */
export function tuyaMalformedError(message: string): IntegrationError {
  return new IntegrationError(message, { integrationId: TUYA_ID, kind: 'unknown' });
}

function kindFor(code: number | undefined): IntegrationErrorKind {
  switch (code) {
    case 1004:
      return 'credentials';
    case 1010:
    case 1011:
    case 1012:
      return 'auth';
    case 1106:
    case 2406:
    case 2010:
    case 28841101:
      return 'permission';
    case 2001:
    case 2007:
    case 28841002:
      return 'quota';
    case 2008:
    case 2009:
    case 28841105:
      return 'device';
    default:
      return 'unknown';
  }
}

function messageFor(code: number | undefined, message: string | undefined): string {
  switch (code) {
    case 1001:
      return 'بيانات الطلب غير صحيحة.';
    case 1004:
      return 'التوقيع غير صالح. تحقّق من صحة Access Secret ومن ضبط ساعة السيرفر.';
    case 1010:
    case 1011:
    case 1012:
      return 'انتهت صلاحية جلسة الدخول لدى Tuya. جارٍ التجديد…';
    case 1100:
      return 'ينقص الطلب معاملاً مطلوباً.';
    case 1106:
      return (
        'صلاحية مرفوضة. تحقّق من: مركز البيانات الصحيح، ومن تفعيل الـ API ' +
        'في المشروع، ومن ربط حساب Smart Life بالمشروع.'
      );
    case 1108:
    case 1109:
      return 'المعامل غير صالح.';
    case 2001:
      return 'تجاوزت حصة الاستدعاءات المسموحة لهذا الشهر.';
    case 2007:
      return 'انتهت صلاحية اشتراك المشروع على منصة Tuya — جدّده من لوحة iot.tuya.com.';
    case 2008:
    case 2009:
      return 'أمر غير مدعوم من هذا الجهاز.';
    case 2010:
      return 'المشروع غير موجود أو غير مفعّل.';
    case 2406:
      return (
        'المشروع غير مربوط بحساب تطبيق. اربط حساب Smart Life عبر QR في ' +
        'لوحة Tuya ثم أعد المحاولة.'
      );
    case 28841002:
      return 'انتهت فترة التجربة المجانية للمشروع على منصة Tuya — جدّدها من لوحة iot.tuya.com.';
    case 28841101:
      return 'لا تملك صلاحية على هذا الجهاز.';
    case 28841105:
      return 'الجهاز غير متصل بالإنترنت حالياً.';
    default:
      // كود غير معروف: نُظهر نص Tuya الأصلي بدل ابتلاع ما لا نفهمه.
      if (message) {
        return `خطأ من Tuya: ${message}${code === undefined ? '' : ` (${code})`}`;
      }
      return `حدث خطأ غير متوقع${code === undefined ? '' : ` (${code})`}.`;
  }
}
