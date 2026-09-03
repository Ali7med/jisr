import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/app_config.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/device_snapshot.dart';
import 'package:jisr/domain/models/device_state.dart';

final deviceDetailProvider =
    AsyncNotifierProvider.family<DeviceDetailViewModel, DeviceSnapshot, String>(
      DeviceDetailViewModel.new,
    );

/// تفاصيل جهاز واحد: لقطة أولى من السيرفر، ثم **تحديثات لحظية**.
///
/// لا استقصاء دوري بعد P3.5.
class DeviceDetailViewModel
    extends FamilyAsyncNotifier<DeviceSnapshot, String> {
  /// قدرات لها أمر قيد التنفيذ — نتجاهل قراءات السيرفر عنها مؤقتاً حتى
  /// لا يقفز المفتاح ذهاباً وإياباً قبل أن يلحق الجهاز بالأمر.
  final Set<String> _pending = {};

  String get deviceId => arg;

  @override
  Future<DeviceSnapshot> build(String deviceId) async {
    ref.listen(stateUpdatesProvider, (_, next) {
      final update = next.value;
      if (update != null && update.deviceId == deviceId) _apply(update.values);
    });

    return ref.read(deviceRepositoryProvider).fetchSnapshot(deviceId);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(deviceRepositoryProvider).fetchSnapshot(deviceId),
    );
  }

  /// إرسال أمر مع تحديث تفاؤلي: نغيّر الواجهة فوراً ونتراجع إن فشل.
  ///
  /// يعيد رمي الاستثناء بعد التراجع ليعرض المستدعي رسالة.
  Future<void> sendCommand(String key, Object? value) async {
    final snapshot = state.value;
    if (snapshot == null) return;

    final previous = snapshot.values[key];
    _pending.add(key);
    state = AsyncData(snapshot.withValue(key, value));

    try {
      await ref
          .read(deviceRepositoryProvider)
          .sendCommand(deviceId, key, value);
      await Future<void>.delayed(AppTuning.commandSettleDelay);
      await _refreshSilently();
    } catch (_) {
      final current = state.value;
      if (current != null) {
        state = AsyncData(current.withValue(key, previous));
      }
      rethrow;
    } finally {
      _pending.remove(key);
    }
  }

  /// تحديث وارد من القناة: يدمج القيم ويُسقط صفة «قديمة» عن اللقطة.
  ///
  /// القدرات التي لها أمر قيد التنفيذ تُستثنى: قيمتنا التفاؤلية أحدث من
  /// قراءة وصلت قبل أن يلحق الجهاز بالأمر.
  void _apply(List<StateValue> values) {
    final current = state.value;
    if (current == null) return;

    final incoming = [
      for (final value in values)
        if (!_pending.contains(value.key)) value,
    ];
    if (incoming.isEmpty) return;

    state = AsyncData(current.merged(incoming));
  }

  Future<void> _refreshSilently() async {
    final current = state.value;
    if (current == null) return;

    try {
      final fresh = await ref
          .read(deviceRepositoryProvider)
          .fetchSnapshot(deviceId);
      final latest = state.value;
      if (latest == null) return;

      // نحتفظ بقيمنا التفاؤلية لأي قدرة ما زال أمرها قيد التنفيذ.
      final merged = {...fresh.values};
      for (final key in _pending) {
        if (latest.values.containsKey(key)) merged[key] = latest.values[key];
      }
      state = AsyncData(fresh.copyWith(values: merged));
    } catch (_) {
      // انقطاع عابر: نُبقي آخر لقطة معروضة.
    }
  }
}
