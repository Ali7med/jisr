import 'dart:math' as math;

/// نوع القدرة — **محايد تجاه الشركة المصنّعة**.
///
/// كل تكامل يترجم مفاهيمه إلى هذه الأنواع: Tuya تترجم `Boolean`→[toggle]
/// و`Integer`→[range]، وTasmota تترجم `POWER`→[toggle]، وهكذا.
/// الواجهة تعرف هذه الأنواع فقط ولا تعرف أي شركة.
enum CapabilityKind {
  /// تشغيل/إطفاء.
  toggle,

  /// قيمة عددية ضمن مدى (سطوع، حرارة مضبوطة، نسبة فتح).
  range,

  /// اختيار من قائمة محدّدة (وضع التشغيل، سرعة المروحة).
  mode,

  /// قراءة نصية أو معقّدة لا تُحرَّر.
  text,

  /// نوع لم نتعرّف عليه — يُعرض خاماً ولا يُخفى.
  unknown,
}

/// قدرة واحدة على جهاز: ما يمكن قراءته أو التحكم به.
///
/// يوحّد ما تسمّيه Tuya «نقطة بيانات (DP)» وما تسمّيه شركات أخرى
/// «attribute» أو «channel» أو «entity».
class Capability {
  const Capability({
    required this.key,
    required this.kind,
    required this.writable,
    this.readable = true,
    this.min,
    this.max,
    this.step = 1,
    this.scale = 0,
    this.unit,
    this.options = const [],
    this.raw = const {},
  });

  /// المعرّف داخل التكامل — `switch_1` في Tuya، `POWER1` في Tasmota.
  final String key;

  final CapabilityKind kind;

  /// هل يمكن إرسال أمر لتغييرها؟
  final bool writable;

  /// هل تُبلّغ عن قيمة يمكن عرضها؟
  final bool readable;

  final num? min;
  final num? max;
  final num step;

  /// أُسّ العشرة الذي تُقسم عليه القيمة الخام للعرض.
  ///
  /// مفهوم من Tuya لكنه شائع: كثير من الشركات ترسل الأعداد العشرية
  /// كأعداد صحيحة مضروبة. تكامل بلا هذا المفهوم يترك [scale] صفراً.
  final int scale;

  final String? unit;

  /// خيارات [CapabilityKind.mode].
  final List<String> options;

  /// بيانات إضافية خاصة بالتكامل — للتشخيص فقط، الواجهة لا تقرأها.
  final Map<String, Object?> raw;

  factory Capability.fromJson(Map<String, dynamic> json) => Capability(
    key: json['key'] as String? ?? '',
    kind: kindFromWire(json['kind'] as String?),
    writable: json['writable'] as bool? ?? false,
    readable: json['readable'] as bool? ?? true,
    min: json['min'] as num?,
    max: json['max'] as num?,
    step: json['step'] as num? ?? 1,
    scale: (json['scale'] as num?)?.toInt() ?? 0,
    unit: json['unit'] as String?,
    options: [
      for (final option in (json['options'] as List? ?? const [])) '$option',
    ],
  );

  Map<String, dynamic> toJson() => {
    'key': key,
    'kind': kind.name,
    'writable': writable,
    'readable': readable,
    'min': min,
    'max': max,
    'step': step,
    'scale': scale,
    'unit': unit,
    'options': options,
  };

  /// نوع لا نعرفه يبقى [CapabilityKind.unknown] ويُعرض خاماً ولا يُخفى.
  static CapabilityKind kindFromWire(String? wire) => switch (wire) {
    'toggle' => CapabilityKind.toggle,
    'range' => CapabilityKind.range,
    'mode' => CapabilityKind.mode,
    'text' => CapabilityKind.text,
    _ => CapabilityKind.unknown,
  };

  // ── تحويل القيم ────────────────────────────────────────────────────────────

  /// القيمة الخام → المعروضة. مثال: 235 مع `scale: 1` ⇒ 23.5
  double toDisplay(num value) => value / math.pow(10, scale);

  /// القيمة المعروضة → الخام المرسلة للجهاز.
  int fromDisplay(double display) => (display * math.pow(10, scale)).round();

  double get displayMin => toDisplay(min ?? 0);
  double get displayMax => toDisplay(max ?? 100);

  double get displayStep {
    final value = toDisplay(step);
    return value > 0 ? value : 1;
  }

  /// عدد الدرجات على المنزلق، أو `null` لمنزلق متّصل.
  int? get divisions {
    if (kind != CapabilityKind.range) return null;

    final span = displayMax - displayMin;
    if (span <= 0 || displayStep <= 0) return null;

    final count = (span / displayStep).round();
    // أعداد هائلة تُبطئ الواجهة بلا فائدة للمستخدم.
    return (count > 0 && count <= 1000) ? count : null;
  }

  Capability copyWith({bool? writable, bool? readable}) => Capability(
    key: key,
    kind: kind,
    writable: writable ?? this.writable,
    readable: readable ?? this.readable,
    min: min,
    max: max,
    step: step,
    scale: scale,
    unit: unit,
    options: options,
    raw: raw,
  );

  @override
  String toString() =>
      'Capability($key, ${kind.name}, writable: $writable, scale: $scale)';
}
