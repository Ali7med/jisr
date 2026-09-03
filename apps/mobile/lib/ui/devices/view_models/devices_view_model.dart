import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/api/realtime_client.dart';
import 'package:jisr/data/repositories/device_repository.dart';

final devicesProvider = AsyncNotifierProvider<DevicesViewModel, DevicesView>(
  DevicesViewModel.new,
);

/// قائمة الأجهزة من السيرفر.
///
/// **لا استقصاء دوري** بعد P3.5: التحديثات تصل عبر القناة اللحظية،
/// والاستقصاء كان يستهلك بطارية وحصّة بلا داعٍ.
class DevicesViewModel extends AsyncNotifier<DevicesView> {
  @override
  Future<DevicesView> build() async {
    if (ref.watch(sessionProvider).value == null) {
      return const DevicesView([]);
    }

    // تغيّر حالة الاتصال إلى «موصول» يعني أننا عدنا بعد انقطاع: نعيد
    // الجلب مرة كي نلحق بما فاتنا وهي مقطوعة.
    ref.listen(connectionStatusProvider, (previous, next) {
      final wasDown = previous?.value != RealtimeStatus.connected;
      if (wasDown && next.value == RealtimeStatus.connected) {
        Future<void>.microtask(refreshSilently);
      }
    });

    // تغيّر حالة جهاز (اتصاله مثلاً) يصل لحظياً؛ القائمة تعرض الاتصال
    // فقط، فتحديثها الخفيف يكفي.
    ref.listen(stateUpdatesProvider, (_, _) {});

    return ref.read(deviceRepositoryProvider).fetchDevices();
  }

  /// تحديث يعرض مؤشّر تحميل — للسحب اليدوي.
  Future<void> refresh() async {
    state = const AsyncLoading<DevicesView>().copyWithPrevious(state);
    state = await AsyncValue.guard(
      ref.read(deviceRepositoryProvider).fetchDevices,
    );
  }

  /// تحديث صامت — لا يومض ولا يمسح ما هو معروض عند فشل عابر.
  Future<void> refreshSilently() async {
    try {
      state = AsyncData(
        await ref.read(deviceRepositoryProvider).fetchDevices(),
      );
    } catch (_) {
      // انقطاع عابر: نُبقي آخر قائمة معروضة.
    }
  }
}
