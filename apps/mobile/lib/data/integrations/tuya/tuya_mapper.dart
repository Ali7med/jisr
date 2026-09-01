import 'dart:convert';

import 'package:jisr/data/integrations/tuya/tuya_config.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_state.dart';

/// يترجم استجابات Tuya الخام إلى نماذج المجال المحايدة.
///
/// **هذا الملف هو حدود Tuya في المشروع.** كل ما هو خاص بـ Tuya —
/// أسماء الفئات، أنواع الـ DP، شكل حقل `values` — ينتهي هنا.
/// ما فوقه لا يعرف أن Tuya موجودة أصلاً.
abstract final class TuyaMapper {
  // ── الأجهزة ────────────────────────────────────────────────────────────────

  static Device device(
    Map<String, dynamic> json, {
    required String accountId,
    required TuyaDataCenter dataCenter,
  }) {
    final name = (json['name'] as String?)?.trim();
    final categoryCode = json['category'] as String? ?? '';

    return Device(
      integrationId: TuyaConfig.id,
      accountId: accountId,
      nativeId: json['id'] as String? ?? '',
      name: (name == null || name.isEmpty) ? 'جهاز بلا اسم' : name,
      category: _category(categoryCode),
      online: json['online'] as bool? ?? false,
      model: json['model'] as String? ?? '',
      productName: json['product_name'] as String? ?? '',
      iconUrl: dataCenter.iconUrl(json['icon'] as String?),
      isSubDevice: json['sub'] as bool? ?? false,
    );
  }

  /// فئات Tuya الشائعة → الفئات الموحّدة.
  ///
  /// أي رمز غير مُدرَج يصير [DeviceCategory.other] — الجهاز يظهر ويعمل،
  /// فقط تجميعه في القائمة يكون أعمّ.
  static DeviceCategory _category(String code) => switch (code) {
    'kg' || 'tdq' => DeviceCategory.switch_,
    'cz' || 'pc' => DeviceCategory.socket,
    'dj' ||
    'dd' ||
    'dc' ||
    'xdd' ||
    'fwd' ||
    'tgq' ||
    'tgkg' ||
    'tyndj' => DeviceCategory.light,
    'wk' || 'wkf' || 'ktkzq' || 'qn' || 'kt' || 'rs' => DeviceCategory.climate,
    'fs' || 'fskg' || 'kj' => DeviceCategory.fan,
    'cl' || 'clkg' => DeviceCategory.cover,
    'ms' || 'jtmspro' => DeviceCategory.lock,
    'sp' => DeviceCategory.camera,
    'znrb' || 'dlq' || 'amy' || 'zndb' => DeviceCategory.energy,
    'wnykq' || 'infrared_tv' || 'qt' => DeviceCategory.remote,
    'mc' ||
    'pir' ||
    'wsdcg' ||
    'ldcg' ||
    'ywbj' ||
    'rqbj' ||
    'sj' ||
    'sos' ||
    'zd' ||
    'jwbj' ||
    'co2bj' ||
    'pm25' => DeviceCategory.sensor,
    _ => DeviceCategory.other,
  };

  // ── القدرات ────────────────────────────────────────────────────────────────

  /// يدمج `functions` و`status` من `/specifications` في قائمة قدرات واحدة.
  ///
  /// نقطة موجودة في الاثنين ⇒ قابلة للقراءة والكتابة.
  /// نقطة في `status` فقط ⇒ قراءة فقط.
  static List<Capability> capabilities(Map<String, dynamic> specifications) {
    final functions = _definitions(specifications['functions']);
    final statuses = _definitions(specifications['status']);

    final byKey = <String, Capability>{};

    for (final entry in statuses.entries) {
      byKey[entry.key] = entry.value.copyWith(writable: false);
    }
    for (final entry in functions.entries) {
      final existing = byKey[entry.key];
      byKey[entry.key] = entry.value.copyWith(
        writable: true,
        // قدرة موجودة في status أيضاً تعني أنها تُبلّغ عن قيمتها.
        readable: existing != null,
      );
    }

    return byKey.values.toList();
  }

  static Map<String, Capability> _definitions(Object? raw) {
    if (raw is! List) return const {};

    final result = <String, Capability>{};
    for (final item in raw.whereType<Map<Object?, Object?>>()) {
      final json = Map<String, dynamic>.from(item);
      final key = json['code'] as String? ?? '';
      if (key.isEmpty) continue;

      final constraints = _values(json['values']);
      result[key] = Capability(
        key: key,
        kind: _kind(json['type'] as String?),
        writable: false,
        min: constraints['min'] as num?,
        max: constraints['max'] as num?,
        step: (constraints['step'] as num?) ?? 1,
        scale: (constraints['scale'] as num?)?.toInt() ?? 0,
        unit: _unit(constraints['unit']),
        options:
            (constraints['range'] as List?)?.map((e) => '$e').toList() ??
            const [],
        raw: constraints,
      );
    }
    return result;
  }

  /// Tuya تستخدم `Integer` في `/specifications` و`Value` في `/functions`.
  static CapabilityKind _kind(String? type) => switch (type?.toLowerCase()) {
    'boolean' || 'bool' => CapabilityKind.toggle,
    'integer' || 'value' => CapabilityKind.range,
    'enum' => CapabilityKind.mode,
    'string' || 'json' || 'raw' => CapabilityKind.text,
    _ => CapabilityKind.unknown,
  };

  /// حقل `values` يصل من Tuya **نصّاً يحوي JSON**، لا كائناً.
  static Map<String, dynamic> _values(Object? values) {
    if (values == null) return const {};
    if (values is Map) return Map<String, dynamic>.from(values);

    if (values is String) {
      final trimmed = values.trim();
      if (trimmed.isEmpty || trimmed == '{}') return const {};
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } on FormatException {
        // قيود غير قابلة للتحليل: نتجاهلها ونعرض القيمة خاماً بدل الانهيار.
      }
    }
    return const {};
  }

  static String? _unit(Object? unit) {
    final text = (unit as String?)?.trim();
    return (text == null || text.isEmpty) ? null : text;
  }

  // ── الحالة والسجلّ ─────────────────────────────────────────────────────────

  static List<StateValue> states(Object? raw) {
    if (raw is! List) return const [];

    return raw
        .whereType<Map<Object?, Object?>>()
        .map(Map<String, dynamic>.from)
        .where((json) => (json['code'] as String? ?? '').isNotEmpty)
        .map(
          (json) =>
              StateValue(key: json['code'] as String, value: json['value']),
        )
        .toList();
  }

  /// سجلّ Tuya يرجع القيم نصّاً دائماً؛ ما لا يُحلَّل رقماً يُستبعد من الرسم.
  static List<HistoryPoint> history(Object? raw) {
    if (raw is! List) return const [];

    final points = <HistoryPoint>[];
    for (final item in raw.whereType<Map<Object?, Object?>>()) {
      final json = Map<String, dynamic>.from(item);
      final key = json['code'] as String? ?? '';
      final value = double.tryParse('${json['value'] ?? ''}');
      final millis = (json['event_time'] as num?)?.toInt();
      if (key.isEmpty || value == null || millis == null) continue;

      points.add(
        HistoryPoint(
          key: key,
          value: value,
          at: DateTime.fromMillisecondsSinceEpoch(millis),
        ),
      );
    }

    // Tuya ترجعها من الأحدث للأقدم؛ الرسم البياني يحتاج العكس.
    points.sort((a, b) => a.at.compareTo(b.at));
    return points;
  }
}
