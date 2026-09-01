/// ثوابت سلوك التطبيق، مستقلّة عن أي تكامل.
abstract final class AppTuning {
  /// تحديث دوري لشاشة تفاصيل الجهاز — المستخدم ينظر إليها الآن.
  static const Duration detailPollInterval = Duration(seconds: 10);

  /// تحديث دوري لقائمة الأجهزة — حالة الاتصال تكفي بدقة أخشن.
  static const Duration listPollInterval = Duration(seconds: 30);

  /// مهلة بعد إرسال أمر قبل تصديق قراءة الخادم.
  ///
  /// الجهاز لا يُبلّغ حالته لحظياً؛ القراءة الفورية تُرجع القيمة القديمة
  /// فيرتدّ المفتاح أمام المستخدم.
  static const Duration commandSettleDelay = Duration(milliseconds: 900);
}
