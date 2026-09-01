/// خطأ قادم من تكامل، برسالة عربية جاهزة للعرض.
///
/// كل تكامل يترجم أكواد شركته إلى هذا النوع، فالواجهة تعرض [message]
/// ولا تفسّر أكواد أي شركة.
class IntegrationException implements Exception {
  const IntegrationException(
    this.message, {
    this.integrationId,
    this.code,
    this.rawMessage,
    this.kind = IntegrationErrorKind.unknown,
  });

  /// رسالة عربية تشرح ما حدث وما العمل.
  final String message;

  /// أي تكامل رماها — `tuya` مثلاً.
  final String? integrationId;

  /// كود الخطأ الأصلي من الشركة، للتشخيص.
  final Object? code;

  /// نص الخطأ الأصلي (إنجليزي غالباً)، للتشخيص.
  final String? rawMessage;

  final IntegrationErrorKind kind;

  factory IntegrationException.network(
    String? detail, {
    String? integrationId,
  }) => IntegrationException(
    'تعذّر الاتصال بالخادم. تحقّق من اتصال الإنترنت.',
    integrationId: integrationId,
    rawMessage: detail,
    kind: IntegrationErrorKind.network,
  );

  /// هل يُجدي إعادة المحاولة بعد تجديد المصادقة؟
  bool get isAuthProblem => kind == IntegrationErrorKind.auth;

  @override
  String toString() =>
      'IntegrationException(${integrationId ?? '-'}, ${kind.name}, '
      'code: $code, message: $message)';
}

/// تصنيف عامّ للخطأ — يسمح للطبقات الأعلى بالتصرّف بلا معرفة الشركة.
enum IntegrationErrorKind {
  /// اعتمادات خاطئة أو توقيع فاسد.
  credentials,

  /// جلسة/توكن منتهٍ — قابل للإصلاح بإعادة المصادقة.
  auth,

  /// صلاحية مرفوضة أو إعداد ناقص في لوحة الشركة.
  permission,

  /// تجاوز حصة أو حدّ معدّل.
  quota,

  /// الجهاز غير متصل أو لا يدعم الأمر.
  device,

  /// مشكلة شبكة.
  network,

  unknown,
}
