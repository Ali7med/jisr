import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/data/api/jisr_api_client.dart';
import 'package:jisr/data/api/realtime_client.dart';
import 'package:jisr/data/api/session_store.dart';
import 'package:jisr/data/repositories/device_repository.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/integration_info.dart';

/// حقن الاعتماديات لكامل التطبيق.
///
/// شجرة التبعية بعد [ADR-0009]:
/// ```
/// sessionProvider → apiClientProvider → deviceRepositoryProvider
///                                    → realtimeProvider
/// ```
/// تسجيل الدخول أو الخروج يعيد بناء السلسلة كلها.

final apiClientProvider = Provider<JisrApiClient>((ref) => JisrApiClient());

/// الجلسة الحالية. `null` تعني أن على المستخدم تسجيل الدخول.
final sessionProvider = AsyncNotifierProvider<SessionNotifier, Session?>(
  SessionNotifier.new,
);

class SessionNotifier extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() => ref.read(apiClientProvider).restore();

  Future<void> login({required String email, required String password}) async {
    final session = await ref
        .read(apiClientProvider)
        .login(email: email, password: password);
    state = AsyncData(session);
  }

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    final session = await ref
        .read(apiClientProvider)
        .register(email: email, password: password, displayName: displayName);
    state = AsyncData(session);
  }

  /// الخروج يمسح الجلسة **والكاش**: بيانات مستخدم سابق لا تظهر لغيره.
  Future<void> logout() async {
    await ref.read(deviceRepositoryProvider).clear();
    await ref.read(apiClientProvider).logout();
    state = const AsyncData(null);
  }
}

final deviceRepositoryProvider = Provider<DeviceRepository>(
  (ref) => DeviceRepository(ref.watch(apiClientProvider)),
);

// ── القناة اللحظية ───────────────────────────────────────────────────────────

/// عميل القناة — يبدأ مع الجلسة ويتوقّف بانتهائها.
final realtimeProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient();
  ref.onDispose(client.dispose);

  final session = ref.watch(sessionProvider).value;
  if (session != null) {
    client.start(session.accessToken);
  } else {
    client.stop();
  }
  return client;
});

/// حالة الاتصال — تعرضها الواجهة صراحةً بدل أن توهم المستخدم بحياة الشاشة.
final connectionStatusProvider = StreamProvider<RealtimeStatus>((ref) {
  final client = ref.watch(realtimeProvider);
  return client.status;
});

/// تحديثات الحالة الواردة — تستهلكها نماذج العرض بدل الاستقصاء الدوري.
final stateUpdatesProvider = StreamProvider<DeviceStateUpdate>((ref) {
  return ref.watch(realtimeProvider).updates;
});

// ── الحسابات والتكاملات ──────────────────────────────────────────────────────

/// الشركات المدعومة **كما يصفها السيرفر** — شركة جديدة تظهر بلا تحديث
/// للتطبيق (القاعدة الحاكمة 7).
final integrationsProvider = FutureProvider<List<IntegrationInfo>>(
  (ref) => ref.watch(apiClientProvider).fetchIntegrations(),
);

final accountsProvider = AsyncNotifierProvider<AccountsNotifier, List<Account>>(
  AccountsNotifier.new,
);

class AccountsNotifier extends AsyncNotifier<List<Account>> {
  @override
  Future<List<Account>> build() async {
    if (ref.watch(sessionProvider).value == null) return const [];
    return ref.read(apiClientProvider).fetchAccounts();
  }

  Future<void> reload() async {
    state = await AsyncValue.guard(ref.read(apiClientProvider).fetchAccounts);
  }

  Future<void> remove(String accountId) async {
    await ref.read(apiClientProvider).deleteAccount(accountId);
    await reload();
  }

  Future<void> sync(String accountId) async {
    await ref.read(apiClientProvider).syncAccount(accountId);
    await reload();
  }
}
