import 'package:jisr/domain/models/capability.dart';

/// تنسيق قيمة قدرة للعرض: يطبّق `scale` ويلحق الوحدة ويترجم الحالات.
///
/// أي قيمة لا نفهمها تُعرض كما هي — لا نُخفي شيئاً عن المستخدم.
String formatCapabilityValue(Capability? capability, Object? value) {
  if (value == null) return '—';
  if (capability == null) return '$value';

  switch (capability.kind) {
    case CapabilityKind.toggle:
      if (value is bool) return value ? 'يعمل' : 'متوقف';
      return '$value';

    case CapabilityKind.range:
      final numeric = value is num ? value : num.tryParse('$value');
      if (numeric == null) return '$value';

      final text = _trimZeros(capability.toDisplay(numeric), capability.scale);
      final unit = capability.unit;
      return unit == null ? text : '$text $unit';

    case CapabilityKind.mode:
      return optionLabel('$value');

    case CapabilityKind.text:
    case CapabilityKind.unknown:
      return '$value';
  }
}

/// نعرض خانات عشرية بقدر `scale` فقط، ونحذف الأصفار الزائدة.
String _trimZeros(double value, int scale) {
  if (scale <= 0) return value.toStringAsFixed(0);

  final text = value.toStringAsFixed(scale);
  if (!text.contains('.')) return text;
  return text.replaceFirst(RegExp(r'\.?0+$'), '');
}

/// عنوان مقروء لقدرة.
///
/// المفاتيح أدناه شائعة عبر شركات كثيرة (Tuya وTasmota وغيرهما تستخدم
/// أسماء متقاربة). ما ليس مُدرَجاً يُعرض بمفتاحه الأصلي — **تحسين تجميلي
/// فقط، غيابه لا يكسر شيئاً.**
String capabilityLabel(String key) {
  final known = _labels[key];
  if (known != null) return known;

  // مفاتيح مرقّمة: switch_1 → المفتاح 1
  final numbered = RegExp(r'^(?:switch|power)_?(\d+)$').firstMatch(key);
  if (numbered != null) return 'المفتاح ${numbered.group(1)}';

  return key;
}

const Map<String, String> _labels = {
  'switch': 'التشغيل',
  'power': 'التشغيل',
  'switch_led': 'الإضاءة',
  'led_switch': 'الإضاءة',
  'switch_usb1': 'منفذ USB',
  'child_lock': 'قفل الأطفال',
  'bright_value': 'السطوع',
  'bright_value_v2': 'السطوع',
  'brightness': 'السطوع',
  'temp_value': 'درجة لون الإضاءة',
  'temp_value_v2': 'درجة لون الإضاءة',
  'colour_data': 'بيانات اللون',
  'colour_data_v2': 'بيانات اللون',
  'work_mode': 'وضع التشغيل',
  'countdown': 'العدّاد التنازلي',
  'countdown_1': 'العدّاد التنازلي',
  'temp_current': 'درجة الحرارة',
  'temp_set': 'الحرارة المضبوطة',
  'va_temperature': 'درجة الحرارة',
  'humidity_value': 'الرطوبة',
  'va_humidity': 'الرطوبة',
  'battery_percentage': 'البطارية',
  'battery_state': 'حالة البطارية',
  'bright_value_sensor': 'شدة الإضاءة',
  'doorcontact_state': 'حالة الباب',
  'pir': 'الحركة',
  'smoke_sensor_status': 'حالة كاشف الدخان',
  'gas_sensor_status': 'حالة كاشف الغاز',
  'watersensor_state': 'حالة تسرّب الماء',
  'cur_current': 'التيار',
  'cur_power': 'القدرة',
  'cur_voltage': 'الفولتية',
  'add_ele': 'الطاقة المستهلكة',
  'forward_energy_total': 'إجمالي الطاقة',
  'fan_speed': 'سرعة المروحة',
  'fan_speed_enum': 'سرعة المروحة',
  'mode': 'الوضع',
  'control': 'التحكم',
  'percent_control': 'نسبة الفتح',
  'percent_state': 'نسبة الفتح الحالية',
  'position': 'الموضع',
};

/// ترجمة خيارات الأوضاع الشائعة.
String optionLabel(String value) => _options[value] ?? value;

const Map<String, String> _options = {
  'white': 'أبيض',
  'colour': 'ملوّن',
  'scene': 'مشهد',
  'music': 'موسيقى',
  'auto': 'تلقائي',
  'manual': 'يدوي',
  'smart': 'ذكي',
  'cold': 'تبريد',
  'hot': 'تدفئة',
  'wind': 'تهوية',
  'dry': 'تجفيف',
  'low': 'منخفض',
  'mid': 'متوسط',
  'middle': 'متوسط',
  'high': 'مرتفع',
  'open': 'فتح',
  'close': 'إغلاق',
  'stop': 'إيقاف',
  'on': 'تشغيل',
  'off': 'إطفاء',
  'normal': 'طبيعي',
  'alarm': 'إنذار',
  'sleep': 'نوم',
  'eco': 'اقتصادي',
};
