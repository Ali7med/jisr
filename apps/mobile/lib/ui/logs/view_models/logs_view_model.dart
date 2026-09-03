import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/device_state.dart';

/// معاملات استعلام السجلّ. سجلّ Dart يعطينا مساواة بالقيمة مجاناً،
/// وهي شرط عمل `family` في Riverpod.
typedef HistoryQuery = ({String deviceId, String key, Duration window});

/// سجلّ قراءة واحدة عبر نافذة زمنية — يجمعه السيرفر من قاعدته أو من
/// الشركة، والتطبيق لا يعرف الفرق ولا يحتاجه.
final historyProvider = FutureProvider.family<List<HistoryPoint>, HistoryQuery>(
  (ref, query) => ref
      .watch(deviceRepositoryProvider)
      .fetchHistory(query.deviceId, keys: [query.key], window: query.window),
);
