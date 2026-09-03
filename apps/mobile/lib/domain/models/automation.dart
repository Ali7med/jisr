import 'package:jisr/utils/capability_format.dart';

/// موازنة قيمة في مُشغِّل أو شرط.
enum CompareOp { eq, ne, gt, gte, lt, lte, changed, unknown }

/// نوع المُشغِّل: «حين تصير قراءة كذا» أو «كل يوم الساعة كذا».
enum AutomationTriggerKind { state, schedule, unknown }

/// مُشغِّل الأتمتة كما يصل من السيرفر.
///
/// شكل واحد بحقول اختيارية بدل صنف لكل نوع: الهاتف **يقرأ ولا يبني**
/// أتمتة، وكل ما يحتاجه سطر عربي يشرح المُشغِّل. صنف لكل نوع يضاعف
/// الكود بلا مقابل هنا.
class AutomationTrigger {
  const AutomationTrigger({
    required this.kind,
    this.deviceId = '',
    this.key = '',
    this.op = CompareOp.unknown,
    this.value,
    this.at = '',
    this.days = const [],
    this.timezone = '',
  });

  final AutomationTriggerKind kind;

  // حقول مُشغِّل الحالة
  final String deviceId;
  final String key;
  final CompareOp op;
  final Object? value;

  // حقول مُشغِّل الوقت
  final String at;

  /// أيام الأسبوع، ٠ = الأحد. قائمة فارغة تعني كل يوم.
  final List<int> days;

  /// منطقة المستخدم المعلنة (IANA) التي كُتب بها [at].
  final String timezone;

  factory AutomationTrigger.fromJson(Map<String, dynamic> json) {
    final kind = kindFromWire(json['kind'] as String?);
    return AutomationTrigger(
      kind: kind,
      deviceId: json['deviceId'] as String? ?? '',
      key: json['key'] as String? ?? '',
      op: opFromWire(json['op'] as String?),
      value: json['value'],
      at: json['at'] as String? ?? '',
      days: [
        for (final day in (json['days'] as List? ?? const []))
          if (day is num) day.toInt(),
      ],
      timezone: json['timezone'] as String? ?? '',
    );
  }

  static AutomationTriggerKind kindFromWire(String? wire) => switch (wire) {
    'state' => AutomationTriggerKind.state,
    'schedule' => AutomationTriggerKind.schedule,
    _ => AutomationTriggerKind.unknown,
  };

  static CompareOp opFromWire(String? wire) => switch (wire) {
    'eq' => CompareOp.eq,
    'ne' => CompareOp.ne,
    'gt' => CompareOp.gt,
    'gte' => CompareOp.gte,
    'lt' => CompareOp.lt,
    'lte' => CompareOp.lte,
    'changed' => CompareOp.changed,
    _ => CompareOp.unknown,
  };

  /// سطر عربي واحد يشرح متى تعمل الأتمتة.
  ///
  /// [deviceName] يحوّل معرّف الجهاز إلى اسمه المعروض؛ بدونه يُعرض
  /// المعرّف — سطر بمعرّف خام أنفع من سطر ناقص.
  String describeArabic({String Function(String deviceId)? deviceName}) =>
      switch (kind) {
        AutomationTriggerKind.schedule => _describeSchedule(),
        AutomationTriggerKind.state => _describeState(deviceName),
        AutomationTriggerKind.unknown =>
          'مُشغِّل لا يعرفه هذا الإصدار — حدّث التطبيق لعرض تفاصيله.',
      };

  String _describeSchedule() {
    final time = at.isEmpty ? '—' : at;
    // الوقت يُعرض كما صرّح به مُنشئ الأتمتة مع منطقته: تحويله لتوقيت
    // الهاتف يحتاج جدول مناطق IANA كاملاً، وتحويلٌ خاطئ في أتمتة تعمل
    // بلا مستخدم أسوأ من منطقة مكتوبة صراحةً.
    final zone = timezone.isEmpty ? '' : ' بتوقيت $timezone';

    if (days.isEmpty) return 'كل يوم الساعة $time$zone';

    final names = [for (final day in days) _dayName(day)];
    return 'أيام ${names.join(' و')} الساعة $time$zone';
  }

  String _describeState(String Function(String deviceId)? deviceName) {
    final device = deviceName?.call(deviceId) ?? deviceId;
    final reading = capabilityLabel(key);

    return switch (op) {
      CompareOp.changed => 'حين تتغيّر $reading في $device',
      CompareOp.unknown =>
        'شرط لا يعرفه هذا الإصدار على $reading في $device — حدّث التطبيق.',
      _ => [
        'حين تصير',
        reading,
        _opLabel(),
        _valueLabel(),
        'في',
        device,
      ].where((part) => part.isNotEmpty).join(' '),
    };
  }

  /// `eq` بلا كلمة: «حين تصير الحرارة ٣٠» أسلس من «حين تصير الحرارة تساوي ٣٠».
  String _opLabel() => switch (op) {
    CompareOp.eq => '',
    CompareOp.ne => 'غير',
    CompareOp.gt => 'أكبر من',
    CompareOp.gte => 'لا تقلّ عن',
    CompareOp.lt => 'أصغر من',
    CompareOp.lte => 'لا تزيد عن',
    CompareOp.changed || CompareOp.unknown => '',
  };

  String _valueLabel() => switch (value) {
    null => '',
    final bool flag => flag ? 'يعمل' : 'متوقف',
    final Object other => '$other',
  };

  @override
  String toString() => 'AutomationTrigger(${kind.name})';
}

/// ٠ = الأحد، كما في العقد.
String _dayName(int day) =>
    (day >= 0 && day < _dayNames.length) ? _dayNames[day] : 'يوم $day';

const _dayNames = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

/// أتمتة كما يعرضها الهاتف — **قراءة فقط في هذا الإصدار**.
///
/// الشروط والإجراءات لا تُقرأ هنا عمداً: عرضها يحتاج بانياً بصرياً
/// كاملاً، وحقلٌ نقرأه ولا نعرضه دَينٌ صامت.
class Automation {
  const Automation({
    required this.id,
    required this.name,
    required this.enabled,
    required this.trigger,
    required this.createdAt,
    this.lastRunAt,
  });

  final String id;
  final String name;
  final bool enabled;
  final AutomationTrigger trigger;
  final DateTime createdAt;

  /// `null` تعني «لم تُنفَّذ بعد» — لا «فشلت».
  final DateTime? lastRunAt;

  factory Automation.fromJson(Map<String, dynamic> json) => Automation(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? 'أتمتة بلا اسم',
    enabled: json['enabled'] as bool? ?? false,
    trigger: AutomationTrigger.fromJson(
      json['trigger'] is Map
          ? Map<String, dynamic>.from(json['trigger'] as Map)
          : const <String, dynamic>{},
    ),
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ??
        DateTime.now(),
    lastRunAt: DateTime.tryParse(json['lastRunAt'] as String? ?? '')?.toLocal(),
  );

  @override
  String toString() => 'Automation($id, "$name", enabled: $enabled)';
}

/// سجلّ تنفيذ واحد — يجعل «لماذا لم تعمل أتمتتي؟» سؤالاً له جواب.
class AutomationRun {
  const AutomationRun({
    required this.succeeded,
    required this.detail,
    required this.ranAt,
  });

  final bool succeeded;
  final String detail;
  final DateTime ranAt;

  factory AutomationRun.fromJson(Map<String, dynamic> json) => AutomationRun(
    succeeded: json['succeeded'] as bool? ?? false,
    detail: json['detail'] as String? ?? '',
    ranAt:
        DateTime.tryParse(json['ranAt'] as String? ?? '')?.toLocal() ??
        DateTime.now(),
  );

  @override
  String toString() => 'AutomationRun($ranAt, succeeded: $succeeded)';
}
