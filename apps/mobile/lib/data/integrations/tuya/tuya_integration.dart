import 'package:jisr/data/integrations/tuya/tuya_client.dart';
import 'package:jisr/data/integrations/tuya/tuya_config.dart';
import 'package:jisr/data/integrations/tuya/tuya_errors.dart';
import 'package:jisr/data/integrations/tuya/tuya_mapper.dart';
import 'package:jisr/domain/integration.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_state.dart';
import 'package:jisr/domain/models/integration_info.dart';

/// تكامل Tuya / Smart Life عبر Cloud OpenAPI.
///
/// يتصل بسحابة Tuya مباشرة، ويترجم كل استجابة إلى نماذج المجال عبر
/// [TuyaMapper]. لا شيء خاص بـ Tuya يتسرّب فوق هذا الصنف.
class TuyaIntegration implements Integration {
  TuyaIntegration(this.account, {TuyaClient? client})
    : _dataCenter = TuyaDataCenter.fromHost(account[TuyaConfig.keyHost]),
      _client =
          client ??
          TuyaClient(
            accessId: account[TuyaConfig.keyAccessId] ?? '',
            accessSecret: account[TuyaConfig.keyAccessSecret] ?? '',
            dataCenter: TuyaDataCenter.fromHost(account[TuyaConfig.keyHost]),
          );

  @override
  final Account account;

  final TuyaDataCenter _dataCenter;
  final TuyaClient _client;

  String get _uid => account[TuyaConfig.keyUid] ?? '';

  @override
  IntegrationInfo get info => TuyaConfig.info;

  @override
  Future<void> verify() async {
    // جلب قائمة الأجهزة يتحقّق من ثلاثة أشياء دفعة واحدة:
    // صحة التوقيع، صحة مركز البيانات، وصحة الـ UID.
    await _client.get(TuyaPaths.userDevices(_uid));
  }

  @override
  Future<List<Device>> fetchDevices() async {
    final result = await _client.get(TuyaPaths.userDevices(_uid));
    if (result is! List) return const [];

    return result
        .whereType<Map<Object?, Object?>>()
        .map(Map<String, dynamic>.from)
        .map(
          (json) => TuyaMapper.device(
            json,
            accountId: account.id,
            dataCenter: _dataCenter,
          ),
        )
        .where((device) => device.nativeId.isNotEmpty)
        .toList();
  }

  @override
  Future<List<Capability>> fetchCapabilities(String nativeId) async {
    final result = await _client.get(TuyaPaths.specifications(nativeId));
    if (result is! Map) return const [];

    return TuyaMapper.capabilities(Map<String, dynamic>.from(result));
  }

  @override
  Future<List<StateValue>> fetchState(String nativeId) async {
    final result = await _client.get(TuyaPaths.status(nativeId));
    return TuyaMapper.states(result);
  }

  @override
  Future<void> execute(String nativeId, List<Command> commands) async {
    if (commands.isEmpty) return;

    await _client.post(
      TuyaPaths.commands(nativeId),
      body: {
        'commands': [
          for (final command in commands)
            {'code': command.key, 'value': command.value},
        ],
      },
    );
  }

  @override
  Future<List<HistoryPoint>> fetchHistory(
    String nativeId, {
    required List<String> keys,
    required DateTime start,
    required DateTime end,
    int limit = 100,
  }) async {
    final result = await _client.get(
      TuyaPaths.logs(nativeId),
      query: {
        'type': TuyaTuning.reportLogType,
        'start_time': '${start.millisecondsSinceEpoch}',
        'end_time': '${end.millisecondsSinceEpoch}',
        'size': '$limit',
        if (keys.isNotEmpty) 'codes': keys.join(','),
      },
    );

    if (result is! Map) return const [];
    return TuyaMapper.history(Map<String, dynamic>.from(result)['logs']);
  }

  @override
  void dispose() => _client.dispose();

  /// مصنع يُسجَّل في سجلّ التكاملات.
  static Integration create(Account account) {
    if (!account.hasAll(TuyaConfig.requiredKeys)) {
      throw TuyaErrors.malformed('بيانات حساب Tuya ناقصة. أعد الإعداد.');
    }
    return TuyaIntegration(account);
  }
}
