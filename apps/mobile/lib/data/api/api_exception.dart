/// خطأ قادم من سيرفر جسر، برسالة عربية **كتبها السيرفر** جاهزة للعرض.
///
/// الهاتف لا يترجم أكواد أي شركة ولا يفسّرها: عقد `ApiError` يحمل رسالة
/// تشرح ما العمل، والواجهة تعرضها كما هي (القاعدة الحاكمة 4).
class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.code = 'UNKNOWN',
    this.status,
    this.kind = ApiErrorKind.unknown,
  });

  /// رسالة عربية جاهزة للعرض.
  final String message;

  /// رمز الخطأ للتشخيص — لا يُعرض.
  final String code;

  final int? status;
  final ApiErrorKind kind;

  /// الجلسة انتهت: على التطبيق العودة لشاشة الدخول.
  bool get isUnauthorized => kind == ApiErrorKind.unauthorized;

  /// تعذّر الوصول للسيرفر أصلاً — نعرض آخر حالة معروفة بدل شاشة خطأ.
  bool get isOffline => kind == ApiErrorKind.offline;

  factory ApiException.offline([String? detail]) => ApiException(
    'تعذّر الوصول إلى خادم جسر. تحقّق من اتصالك بالإنترنت.',
    code: detail ?? 'OFFLINE',
    kind: ApiErrorKind.offline,
  );

  @override
  String toString() => 'ApiException($code, status: $status): $message';
}

enum ApiErrorKind {
  /// لا اتصال بالسيرفر (شبكة، مهلة، سيرفر متوقّف).
  offline,

  /// 401 — لا جلسة صالحة.
  unauthorized,

  /// 404 — المورد غير موجود أو ليس للمستخدم.
  notFound,

  /// 400 — بيانات مرفوضة.
  invalid,

  /// 5xx وأخطاء التكاملات التي مرّرها السيرفر.
  server,

  unknown,
}
