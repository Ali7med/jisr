import 'package:jisr/domain/integration.dart';
import 'package:jisr/domain/integration_exception.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_snapshot.dart';
import 'package:jisr/domain/models/device_state.dart';

/// مصدر الحقيقة للأجهزة **عبر كل التكاملات النشطة**.
///
/// نماذج العرض تتعامل معه وحده ولا تعرف أي شركة، ولا حتى كم تكاملاً يعمل.
class DeviceRepository {
  DeviceRepository(this._integrations);

  final List<Integration> _integrations;

  /// القدرات ثابتة عملياً لكل موديل، فنجلبها مرة واحدة لكل جهاز.
  final Map<String, List<Capability>> _capabilityCache = {};

  /// آخر قائمة أجهزة معروفة — تسمح بفتح شاشة جهاز بمعرّفه وحده.
  final Map<String, Device> _devicesById = {};

  /// أخطاء التكاملات التي فشلت في آخر جلب.
  ///
  /// تكامل واحد معطّل يجب ألّا يُخفي أجهزة البقية، لكن يجب ألّا يُبتلع صامتاً.
  final Map<String, IntegrationException> lastErrors = {};

  bool get hasIntegrations => _integrations.isNotEmpty;

  /// أجهزة كل التكاملات. فشل تكامل يُسجَّل في [lastErrors] ولا يُسقط البقية.
  Future<List<Device>> fetchDevices() async {
    lastErrors.clear();

    final results = await Future.wait([
      for (final integration in _integrations) _safeFetch(integration),
    ]);

    final devices = [for (final list in results) ...list];

    _devicesById
      ..clear()
      ..addEntries(devices.map((d) => MapEntry(d.id, d)));

    return devices;
  }

  Future<List<Device>> _safeFetch(Integration integration) async {
    try {
      return await integration.fetchDevices();
    } on IntegrationException catch (error) {
      lastErrors[integration.account.id] = error;
      return const [];
    } catch (error) {
      lastErrors[integration.account.id] = IntegrationException(
        '$error',
        integrationId: integration.info.id,
      );
      return const [];
    }
  }

  /// يجد جهازاً بمعرّفه العام، ويجلب القائمة إن لم يكن مخبّأً.
  Future<Device> findDevice(String deviceId) async {
    final cached = _devicesById[deviceId];
    if (cached != null) return cached;

    await fetchDevices();
    final device = _devicesById[deviceId];
    if (device == null) {
      throw IntegrationException('لم يُعثر على الجهاز. قد يكون حُذف أو فُصل.');
    }
    return device;
  }

  Future<List<Capability>> fetchCapabilities(Device device) async {
    final cached = _capabilityCache[device.id];
    if (cached != null) return cached;

    final capabilities = await _require(
      device.integrationId,
    ).fetchCapabilities(device.nativeId);

    _capabilityCache[device.id] = capabilities;
    return capabilities;
  }

  /// لقطة كاملة. القدرات والحالة يُجلبان معاً لتقليل زمن الانتظار.
  Future<DeviceSnapshot> fetchSnapshot(Device device) async {
    final integration = _require(device.integrationId);

    final results = await Future.wait([
      fetchCapabilities(device),
      integration.fetchState(device.nativeId),
    ]);

    final capabilities = results[0] as List<Capability>;
    final states = results[1] as List<StateValue>;

    return DeviceSnapshot(
      device: device,
      capabilities: capabilities,
      values: {for (final state in states) state.key: state.value},
    );
  }

  Future<void> sendCommand(Device device, String key, Object? value) =>
      _require(
        device.integrationId,
      ).execute(device.nativeId, [Command(key: key, value: value)]);

  Future<List<HistoryPoint>> fetchHistory(
    Device device, {
    required List<String> keys,
    Duration window = const Duration(days: 1),
    int limit = 200,
  }) {
    final integration = _require(device.integrationId);
    if (!integration.info.supportsHistory) return Future.value(const []);

    final now = DateTime.now();
    return integration.fetchHistory(
      device.nativeId,
      keys: keys,
      start: now.subtract(window),
      end: now,
      limit: limit,
    );
  }

  Integration _require(String integrationId) {
    for (final integration in _integrations) {
      if (integration.info.id == integrationId) return integration;
    }
    throw IntegrationException(
      'التكامل «$integrationId» غير مفعّل. تحقّق من الحسابات المرتبطة.',
      integrationId: integrationId,
    );
  }

  /// يُستدعى عند تغيّر الحسابات — القدرات المخبّأة تخص أجهزة قديمة.
  void clearCache() {
    _capabilityCache.clear();
    _devicesById.clear();
    lastErrors.clear();
  }
}
