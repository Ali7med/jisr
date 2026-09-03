import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/data/api/jisr_api_client.dart';
import 'package:jisr/data/repositories/device_cache.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_snapshot.dart';
import 'package:jisr/domain/models/device_state.dart';

/// مصدر الحقيقة للأجهزة — **سيرفر جسر وحده** ([ADR-0009]).
///
/// لا تجميع ولا ترجمة ولا معرفة بأي شركة هنا: السيرفر يسلّم النموذج
/// الموحّد جاهزاً. ما يضيفه هذا الصنف شيء واحد: **سلوك الانقطاع** —
/// آخر حالة معروفة بطابعها الزمني بدل شاشة خطأ (P3.6).
class DeviceRepository {
  DeviceRepository(this._api, {DeviceCache? cache})
    : _cache = cache ?? DeviceCache();

  final JisrApiClient _api;
  final DeviceCache _cache;

  /// آخر قائمة معروفة — تسمح بفتح شاشة جهاز بمعرّفه وحده.
  final Map<String, Device> _devicesById = {};

  Future<DevicesView> fetchDevices() async {
    try {
      final devices = await _api.fetchDevices();
      _index(devices);
      await _cache.saveDevices(devices);
      return DevicesView(devices);
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;

      // السيرفر متعذّر: نعرض آخر ما نعرف ونقول متى عرفناه.
      final cached = await _cache.readDevices();
      if (cached == null) rethrow;

      _index(cached.value);
      return DevicesView(cached.value, staleSince: cached.at);
    }
  }

  Future<Device> findDevice(String deviceId) async {
    final known = _devicesById[deviceId];
    if (known != null) return known;

    await fetchDevices();
    final device = _devicesById[deviceId];
    if (device == null) {
      throw const ApiException(
        'لم نعثر على هذا الجهاز — قد يكون حُذف من حسابك. زامِن الحساب.',
        code: 'NOT_FOUND',
        kind: ApiErrorKind.notFound,
      );
    }
    return device;
  }

  Future<DeviceSnapshot> fetchSnapshot(String deviceId) async {
    try {
      final snapshot = await _api.fetchSnapshot(deviceId);
      await _cache.saveSnapshot(snapshot);
      return snapshot;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;

      final cached = await _cache.readSnapshot(deviceId);
      if (cached == null) rethrow;
      return cached.value.copyWith(staleSince: cached.at);
    }
  }

  Future<void> sendCommand(String deviceId, String key, Object? value) =>
      _api.sendCommands(deviceId, [Command(key: key, value: value)]);

  Future<List<HistoryPoint>> fetchHistory(
    String deviceId, {
    required List<String> keys,
    Duration window = const Duration(days: 1),
    int limit = 200,
  }) => _api.fetchHistory(deviceId, keys: keys, window: window, limit: limit);

  /// يُستدعى عند تسجيل الخروج — كاش مستخدم سابق لا يظهر لمستخدم جديد.
  Future<void> clear() async {
    _devicesById.clear();
    await _cache.clear();
  }

  void _index(List<Device> devices) {
    _devicesById
      ..clear()
      ..addEntries(devices.map((device) => MapEntry(device.id, device)));
  }
}

/// قائمة الأجهزة مع صدقها الزمني.
class DevicesView {
  const DevicesView(this.devices, {this.staleSince});

  final List<Device> devices;

  /// ليس `null` ⇒ هذه البيانات من الكاش، وهذا وقت التقاطها.
  final DateTime? staleSince;

  bool get isStale => staleSince != null;
}
