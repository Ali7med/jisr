import 'package:jisr/domain/integration_exception.dart';

/// ترجمة أكواد خطأ Tuya إلى [IntegrationException] برسائل عربية.
abstract final class TuyaErrors {
  static const String _id = 'tuya';

  static IntegrationException from(int? code, String? message) =>
      IntegrationException(
        _messageFor(code, message),
        integrationId: _id,
        code: code,
        rawMessage: message,
        kind: _kindFor(code),
      );

  static IntegrationException network(String? detail) =>
      IntegrationException.network(detail, integrationId: _id);

  static IntegrationException malformed(String message) => IntegrationException(
    message,
    integrationId: _id,
  );

  static IntegrationErrorKind _kindFor(int? code) => switch (code) {
    1004 => IntegrationErrorKind.credentials,
    1010 || 1011 || 1012 => IntegrationErrorKind.auth,
    1106 || 2406 || 2010 || 28841101 => IntegrationErrorKind.permission,
    2001 || 2007 || 28841002 => IntegrationErrorKind.quota,
    2008 || 2009 || 28841105 => IntegrationErrorKind.device,
    _ => IntegrationErrorKind.unknown,
  };

  static String _messageFor(int? code, String? message) {
    switch (code) {
      case 1001:
        return 'بيانات الطلب غير صحيحة.';
      case 1004:
        return 'التوقيع غير صالح. تحقّق من صحة Access Secret ومن ضبط ساعة الجهاز.';
      case 1010:
      case 1011:
      case 1012:
        return 'انتهت صلاحية جلسة الدخول. جارٍ التجديد…';
      case 1100:
        return 'ينقص الطلب معاملاً مطلوباً.';
      case 1106:
        return 'صلاحية مرفوضة. تحقّق من: مركز البيانات الصحيح، ومن تفعيل الـ API '
            'في المشروع، ومن ربط حساب Smart Life بالمشروع.';
      case 1108:
      case 1109:
        return 'المعامل غير صالح.';
      case 2001:
        return 'تجاوزت حصة الاستدعاءات المسموحة لهذا الشهر.';
      case 2007:
        return 'انتهت صلاحية اشتراك المشروع على منصة Tuya.';
      case 2008:
      case 2009:
        return 'أمر غير مدعوم من هذا الجهاز.';
      case 2010:
        return 'المشروع غير موجود أو غير مفعّل.';
      case 2406:
        return 'المشروع غير مربوط بحساب تطبيق. اربط حساب Smart Life عبر QR في '
            'لوحة Tuya ثم أعد المحاولة.';
      case 28841002:
        return 'انتهت فترة التجربة المجانية للمشروع على منصة Tuya.';
      case 28841101:
        return 'لا تملك صلاحية على هذا الجهاز.';
      case 28841105:
        return 'الجهاز غير متصل بالإنترنت حالياً.';
      default:
        // كود غير معروف: نُظهر نص Tuya الأصلي بدل ابتلاع ما لا نفهمه.
        if (message != null && message.isNotEmpty) {
          return 'خطأ من Tuya: $message${code != null ? ' ($code)' : ''}';
        }
        return 'حدث خطأ غير متوقع${code != null ? ' ($code)' : ''}.';
    }
  }
}
