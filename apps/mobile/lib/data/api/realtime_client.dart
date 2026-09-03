import 'dart:async';
import 'dart:convert';

import 'package:jisr/config/app_config.dart';
import 'package:jisr/domain/models/device_state.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// حالة القناة اللحظية — تعرضها الواجهة صراحةً.
///
/// المستخدم يجب أن يعرف أن ما يراه **آخر حالة معروفة** لا الحالة الآن
/// ([ADR-0014]): شاشة تبدو حيّة وهي مقطوعة أسوأ من شاشة تقول إنها مقطوعة.
enum RealtimeStatus { connecting, connected, disconnected }

/// تحديث حالة وصل من السيرفر.
class DeviceStateUpdate {
  const DeviceStateUpdate({
    required this.deviceId,
    required this.values,
    required this.at,
  });

  final String deviceId;
  final List<StateValue> values;
  final DateTime at;
}

/// عميل القناة اللحظية.
///
/// **المصادقة برسالة لا برابط**: `?token=` يضع رمز الوصول في سجلّات
/// الخوادم والوسطاء، فنرسله في أول إطار بعد الاتصال.
class RealtimeClient {
  RealtimeClient({WebSocketChannel Function(Uri)? connect})
    : _connect = connect ?? WebSocketChannel.connect;

  final WebSocketChannel Function(Uri) _connect;

  final _updates = StreamController<DeviceStateUpdate>.broadcast();
  final _status = StreamController<RealtimeStatus>.broadcast();

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retryTimer;
  String? _token;
  int _attempt = 0;
  bool _closed = false;

  Stream<DeviceStateUpdate> get updates => _updates.stream;
  Stream<RealtimeStatus> get status => _status.stream;

  RealtimeStatus current = RealtimeStatus.disconnected;

  void start(String accessToken) {
    _token = accessToken;
    _closed = false;
    _attempt = 0;
    _open();
  }

  Future<void> stop() async {
    _closed = true;
    _retryTimer?.cancel();
    await _subscription?.cancel();
    await _channel?.sink.close();
    _channel = null;
    _emit(RealtimeStatus.disconnected);
  }

  Future<void> dispose() async {
    await stop();
    await _updates.close();
    await _status.close();
  }

  void _emit(RealtimeStatus value) {
    current = value;
    if (!_status.isClosed) _status.add(value);
  }

  void _open() {
    final token = _token;
    if (_closed || token == null) return;

    _emit(RealtimeStatus.connecting);
    try {
      final channel = _connect(Uri.parse(AppConfig.realtimeUrl));
      _channel = channel;
      channel.sink.add(jsonEncode({'type': 'auth', 'token': token}));

      _subscription = channel.stream.listen(
        _onMessage,
        onError: (Object _) => _scheduleRetry(),
        onDone: _scheduleRetry,
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleRetry();
    }
  }

  void _onMessage(dynamic raw) {
    final decoded = jsonDecode(
      raw is String ? raw : utf8.decode(raw as List<int>),
    );
    if (decoded is! Map) return;
    final message = Map<String, dynamic>.from(decoded);

    switch (message['type']) {
      case 'hello':
        _attempt = 0;
        _emit(RealtimeStatus.connected);
      case 'state':
        _updates.add(
          DeviceStateUpdate(
            deviceId: message['deviceId'] as String? ?? '',
            values: [
              for (final value in (message['values'] as List? ?? const []))
                if (value is Map)
                  StateValue.fromJson(Map<String, dynamic>.from(value)),
            ],
            at:
                DateTime.tryParse(message['at'] as String? ?? '')?.toLocal() ??
                DateTime.now(),
          ),
        );
      default:
        // نوع حدث لا نعرفه (سيرفر أحدث): نتجاهله ولا نُسقط القناة.
        break;
    }
  }

  /// إعادة اتصال بمهل تصاعدية — سيرفر متعثّر لا يُفيده ألف محاولة بالثانية.
  void _scheduleRetry() {
    _subscription?.cancel();
    _subscription = null;
    _channel = null;
    if (_closed) return;

    _emit(RealtimeStatus.disconnected);

    final delays = AppTuning.reconnectBackoff;
    final delay =
        delays[_attempt < delays.length ? _attempt : delays.length - 1];
    _attempt++;

    _retryTimer?.cancel();
    _retryTimer = Timer(delay, _open);
  }
}
