import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/device_state.dart';

/// معاملات استعلام السجلّ. سجلّ Dart يعطينا مساواة بالقيمة مجاناً،
/// وهي شرط عمل `family` في Riverpod.
typedef HistoryQuery = ({String deviceId, String key, Duration window});

/// سجلّ قراءة واحدة عبر نافذة زمنية.
///
/// تكامل لا يدعم السجلّ يُرجع قائمة فارغة، والشاشة تعرض «لا بيانات».
final historyProvider = FutureProvider.family<List<HistoryPoint>, HistoryQuery>(
  (ref, query) async {
    final repository = ref.watch(deviceRepositoryProvider);
    final device = await repository.findDevice(query.deviceId);

    return repository.fetchHistory(
      device,
      keys: [query.key],
      window: query.window,
    );
  },
);
