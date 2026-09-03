import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_state.dart';

/// لقطة كاملة لجهاز: بياناته وقدراته وقيمه الحالية.
///
/// هذا ما تستهلكه شاشة التفاصيل — يجمع ثلاثة استدعاءات منفصلة في كائن واحد.
class DeviceSnapshot {
  const DeviceSnapshot({
    required this.device,
    required this.capabilities,
    required this.values,
    this.staleSince,
  });

  final Device device;
  final List<Capability> capabilities;

  /// القيم الحالية مفهرسة بمفتاح القدرة.
  final Map<String, Object?> values;

  /// ليس `null` ⇒ هذه اللقطة من الكاش لا من السيرفر، وهذا وقت التقاطها.
  /// الواجهة تعرض الطابع الزمني **وتعطّل التحكّم** (P3.6 · [ADR-0014]).
  final DateTime? staleSince;

  bool get isStale => staleSince != null;

  /// ما يُعرض في قسم «التحكّم».
  List<Capability> get controls =>
      capabilities.where((c) => c.writable).toList();

  /// ما يُعرض في قسم «القراءات» — يُقرأ ولا يُكتب.
  List<Capability> get readings =>
      capabilities.where((c) => c.readable && !c.writable).toList();

  Capability? capabilityFor(String key) {
    for (final capability in capabilities) {
      if (capability.key == key) return capability;
    }
    return null;
  }

  DeviceSnapshot copyWith({
    Device? device,
    List<Capability>? capabilities,
    Map<String, Object?>? values,
    DateTime? staleSince,
  }) => DeviceSnapshot(
    device: device ?? this.device,
    capabilities: capabilities ?? this.capabilities,
    values: values ?? this.values,
    staleSince: staleSince ?? this.staleSince,
  );

  /// نسخة بقيمة واحدة معدّلة — تُستخدم في التحديث التفاؤلي.
  DeviceSnapshot withValue(String key, Object? value) =>
      copyWith(values: {...values, key: value});

  /// نسخة بقيم محدّثة من القناة اللحظية — تصير حيّة بعد وصول تحديث.
  DeviceSnapshot merged(Iterable<StateValue> updates) => DeviceSnapshot(
    device: device,
    capabilities: capabilities,
    values: {...values, for (final update in updates) update.key: update.value},
  );

  @override
  String toString() =>
      'DeviceSnapshot(${device.id}, ${capabilities.length} قدرة)';
}
