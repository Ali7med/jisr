/// ثوابت سلوك التطبيق.
///
/// الهاتف **عميل رفيع**: لا يعرف أي شركة، ولا يحمل أي سرّ تكامل، ولا
/// يتصل إلا بسيرفر جسر ([ADR-0009]).
abstract final class AppConfig {
  /// عنوان السيرفر — يُضبط عند البناء:
  /// `flutter run --dart-define=JISR_SERVER_URL=https://jisr.example.com`
  ///
  /// الافتراضي `10.0.2.2` هو مضيف المحاكي على أندرويد (localhost الجهاز
  /// نفسه غير قابل للوصول من داخل المحاكي).
  static const String serverUrl = String.fromEnvironment(
    'JISR_SERVER_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// عنوان القناة اللحظية — يُشتقّ من [serverUrl] ما لم يُضبط صراحةً.
  static String get realtimeUrl {
    const override = String.fromEnvironment('JISR_WS_URL');
    if (override.isNotEmpty) return override;

    final base = Uri.parse(serverUrl);
    return base
        .replace(scheme: base.scheme == 'https' ? 'wss' : 'ws', path: '/ws')
        .toString();
  }
}

abstract final class AppTuning {
  static const Duration requestTimeout = Duration(seconds: 20);

  /// مهلة بعد إرسال أمر قبل تصديق قراءة السيرفر.
  ///
  /// الجهاز لا يُبلّغ حالته لحظياً؛ القراءة الفورية تُرجع القيمة القديمة
  /// فيرتدّ المفتاح أمام المستخدم.
  static const Duration commandSettleDelay = Duration(milliseconds: 900);

  /// مهل إعادة الاتصال بالقناة اللحظية — تصاعدية كي لا نُغرق سيرفراً متعثّراً.
  static const List<Duration> reconnectBackoff = [
    Duration(seconds: 1),
    Duration(seconds: 3),
    Duration(seconds: 8),
    Duration(seconds: 20),
    Duration(seconds: 45),
  ];
}
