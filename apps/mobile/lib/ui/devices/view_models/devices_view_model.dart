import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/app_config.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/device.dart';

final devicesProvider = AsyncNotifierProvider<DevicesViewModel, List<Device>>(
  DevicesViewModel.new,
);

/// قائمة الأجهزة من كل التكاملات، مع تحديث دوري هادئ.
class DevicesViewModel extends AsyncNotifier<List<Device>> {
  Timer? _timer;

  @override
  Future<List<Device>> build() async {
    final repository = ref.watch(deviceRepositoryProvider);
    if (!repository.hasIntegrations) return const [];

    ref.onDispose(() => _timer?.cancel());
    _schedulePolling();

    return repository.fetchDevices();
  }

  /// تحديث يعرض مؤشر تحميل — للسحب اليدوي.
  Future<void> refresh() async {
    final repository = ref.read(deviceRepositoryProvider);
    if (!repository.hasIntegrations) return;

    state = const AsyncLoading<List<Device>>().copyWithPrevious(state);
    state = await AsyncValue.guard(repository.fetchDevices);
  }

  /// تحديث صامت — لا يومض، ولا يمسح البيانات عند فشل مؤقت.
  Future<void> _refreshSilently() async {
    final repository = ref.read(deviceRepositoryProvider);
    if (!repository.hasIntegrations) return;

    try {
      state = AsyncData(await repository.fetchDevices());
    } catch (_) {
      // انقطاع عابر: نُبقي آخر قائمة معروضة ونعيد المحاولة في الدورة التالية.
    }
  }

  void _schedulePolling() {
    _timer?.cancel();
    _timer = Timer.periodic(AppTuning.listPollInterval, (_) {
      if (!ref.read(appActiveProvider)) return;
      unawaited(_refreshSilently());
    });
  }
}
