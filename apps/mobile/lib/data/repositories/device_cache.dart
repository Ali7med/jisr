import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_snapshot.dart';

/// لقطة مخبّأة مع لحظة التقاطها.
class Cached<T> {
  const Cached(this.value, this.at);

  final T value;

  /// **يُعرض للمستخدم صراحةً** عند الانقطاع: «آخر تحديث قبل ٧ دقائق».
  final DateTime at;
}

/// كاش **قراءة فقط** لآخر حالة معروفة ([ADR-0014] · P3.6).
///
/// غرضه واحد: حين يتعذّر السيرفر، يرى المستخدم بيته كما كان آخر مرة —
/// بطابع زمني صريح ومع **تعطيل التحكّم**. لا يُستعمل أبداً كمصدر يُكتب
/// إليه أو يُتحكّم منه: التحكّم بلا سيرفر مرفوض صراحةً في [ADR-0009].
class DeviceCache {
  DeviceCache({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
          );

  static const String _devicesKey = 'jisr_cache_devices_v1';
  static const String _snapshotPrefix = 'jisr_cache_snapshot_v1_';

  final FlutterSecureStorage _storage;

  Future<void> saveDevices(List<Device> devices) => _write(_devicesKey, {
    'at': DateTime.now().toIso8601String(),
    'devices': [for (final device in devices) device.toJson()],
  });

  Future<Cached<List<Device>>?> readDevices() async {
    final json = await _read(_devicesKey);
    if (json == null) return null;

    final devices = [
      for (final item in (json['devices'] as List? ?? const []))
        if (item is Map) Device.fromJson(Map<String, dynamic>.from(item)),
    ];
    return Cached(devices, _at(json));
  }

  Future<void> saveSnapshot(DeviceSnapshot snapshot) =>
      _write('$_snapshotPrefix${snapshot.device.id}', {
        'at': DateTime.now().toIso8601String(),
        'device': snapshot.device.toJson(),
        'capabilities': [for (final c in snapshot.capabilities) c.toJson()],
        // القيم قد تحوي أنواعاً مركّبة؛ jsonEncode يتكفّل بها.
        'values': snapshot.values,
      });

  Future<Cached<DeviceSnapshot>?> readSnapshot(String deviceId) async {
    final json = await _read('$_snapshotPrefix$deviceId');
    if (json == null) return null;

    final device = json['device'];
    if (device is! Map) return null;

    return Cached(
      DeviceSnapshot(
        device: Device.fromJson(Map<String, dynamic>.from(device)),
        capabilities: [
          for (final item in (json['capabilities'] as List? ?? const []))
            if (item is Map)
              Capability.fromJson(Map<String, dynamic>.from(item)),
        ],
        values: Map<String, Object?>.from(json['values'] as Map? ?? const {}),
      ),
      _at(json),
    );
  }

  /// يُمسح عند تسجيل الخروج: كاش مستخدم سابق لا يظهر لمستخدم جديد.
  Future<void> clear() async {
    final all = await _storage.readAll();
    for (final key in all.keys) {
      if (key == _devicesKey || key.startsWith(_snapshotPrefix)) {
        await _storage.delete(key: key);
      }
    }
  }

  DateTime _at(Map<String, dynamic> json) =>
      DateTime.tryParse(json['at'] as String? ?? '')?.toLocal() ??
      DateTime.now();

  Future<void> _write(String key, Map<String, dynamic> value) async {
    try {
      await _storage.write(key: key, value: jsonEncode(value));
    } catch (_) {
      // فشل الكتابة في الكاش لا يُفشل العملية الأصلية — الكاش رفاهية.
    }
  }

  Future<Map<String, dynamic>?> _read(String key) async {
    try {
      final raw = await _storage.read(key: key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {
      return null;
    }
  }
}
