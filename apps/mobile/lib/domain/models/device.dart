/// فئة الجهاز — **مجموعة موحّدة عبر كل الشركات**.
///
/// كل تكامل يترجم فئاته الخاصة إلى هذه: Tuya تترجم `kg`→[switch_]
/// و`wsdcg`→[sensor]. ما لا ينطبق يصير [other] — لا نُخفي الجهاز أبداً.
enum DeviceCategory {
  light('إضاءة'),
  switch_('مفاتيح'),
  socket('مقابس'),
  sensor('حساسات'),
  climate('تكييف وتدفئة'),
  fan('مراوح'),
  cover('ستائر'),
  lock('أقفال'),
  camera('كاميرات'),
  energy('عدّادات طاقة'),
  remote('أجهزة تحكّم بالأشعة'),
  other('أخرى');

  const DeviceCategory(this.labelAr);

  final String labelAr;
}

/// جهاز منزلي ذكي، مستقلّ عن الشركة المصنّعة.
class Device {
  const Device({
    required this.integrationId,
    required this.accountId,
    required this.nativeId,
    required this.name,
    required this.category,
    required this.online,
    this.model = '',
    this.productName = '',
    this.iconUrl,
    this.room,
    this.isSubDevice = false,
  });

  /// معرّف التكامل الذي يملك هذا الجهاز — `tuya` مثلاً.
  final String integrationId;

  /// الحساب المرتبط الذي جاء منه الجهاز (يدعم أكثر من حساب لنفس الشركة).
  final String accountId;

  /// معرّف الجهاز كما تعرفه الشركة.
  final String nativeId;

  /// معرّف عام فريد داخل التطبيق: `tuya:abc123`.
  ///
  /// ضروري لأن معرّفات الشركات قد تتصادم، والتنقّل يحتاج مفتاحاً واحداً.
  String get id => '$integrationId:$nativeId';

  final String name;
  final DeviceCategory category;
  final bool online;
  final String model;
  final String productName;

  /// رابط كامل جاهز للعرض — التكامل يتولّى بناءه.
  final String? iconUrl;

  /// اسم الغرفة إن وفّره التكامل.
  final String? room;

  /// جهاز فرعي خلف بوابة (Zigbee مثلاً).
  final bool isSubDevice;

  /// عنوان المجموعة في القائمة: الغرفة إن وُجدت، وإلا الفئة.
  String get groupLabel =>
      (room != null && room!.isNotEmpty) ? room! : category.labelAr;

  /// يفكّ [id] العام إلى جزأيه. يرمي [FormatException] لمعرّف غير صالح.
  static (String integrationId, String nativeId) parseId(String id) {
    final index = id.indexOf(':');
    if (index <= 0 || index == id.length - 1) {
      throw FormatException('معرّف جهاز غير صالح: $id');
    }
    return (id.substring(0, index), id.substring(index + 1));
  }

  @override
  String toString() => 'Device($id, $name, ${category.name}, online: $online)';
}
