import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/app_config.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/device_snapshot.dart';

final deviceDetailProvider =
    AsyncNotifierProvider.family<DeviceDetailViewModel, DeviceSnapshot, String>(
      DeviceDetailViewModel.new,
    );

/// تفاصيل جهاز واحد، مع تحديث دوري وتحكّم تفاؤلي.
class DeviceDetailViewModel
    extends FamilyAsyncNotifier<DeviceSnapshot, String> {
  Timer? _timer;

  /// قدرات لها أمر قيد التنفيذ — نتجاهل قراءات الخادم عنها مؤقتاً حتى
  /// لا يقفز المفتاح ذهاباً وإياباً قبل أن يلحق الجهاز بالأمر.
  final Set<String> _pending = {};

  String get deviceId => arg;

  @override
  Future<DeviceSnapshot> build(String deviceId) async {
    final repository = ref.watch(deviceRepositoryProvider);

    ref.onDispose(() => _timer?.cancel());
    _schedulePolling();

    final device = await repository.findDevice(deviceId);
    return repository.fetchSnapshot(device);
  }

  Future<void> refresh() async {
    final repository = ref.read(deviceRepositoryProvider);
    final current = state.value;
    if (current == null) return;

    state = await AsyncValue.guard(
      () => repository.fetchSnapshot(current.device),
    );
  }

  /// إرسال أمر مع تحديث تفاؤلي: نغيّر الواجهة فوراً ونتراجع إن فشل.
  ///
  /// يعيد رمي الاستثناء بعد التراجع ليعرض المستدعي رسالة.
  Future<void> sendCommand(String key, Object? value) async {
    final repository = ref.read(deviceRepositoryProvider);
    final snapshot = state.value;
    if (snapshot == null) return;

    final previous = snapshot.values[key];
    _pending.add(key);
    state = AsyncData(snapshot.withValue(key, value));

    try {
      await repository.sendCommand(snapshot.device, key, value);
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

  Future<void> _refreshSilently() async {
    final repository = ref.read(deviceRepositoryProvider);
    final current = state.value;
    if (current == null) return;

    try {
      final fresh = await repository.fetchSnapshot(current.device);
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

  void _schedulePolling() {
    _timer?.cancel();
    _timer = Timer.periodic(AppTuning.detailPollInterval, (_) {
      if (!ref.read(appActiveProvider)) return;
      unawaited(_refreshSilently());
    });
  }
}
