import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/data/integrations/integration_registry.dart';
import 'package:jisr/data/repositories/accounts_repository.dart';
import 'package:jisr/data/repositories/device_repository.dart';
import 'package:jisr/domain/integration.dart';
import 'package:jisr/domain/models/account.dart';

/// حقن الاعتماديات لكامل التطبيق.
///
/// شجرة التبعية:
/// ```
/// accountsProvider → integrationsProvider → deviceRepositoryProvider
/// ```
/// تغيير الحسابات يعيد بناء السلسلة كلها ويُغلق التكاملات القديمة.

// ── الحسابات ─────────────────────────────────────────────────────────────────

final accountsRepositoryProvider = Provider<AccountsRepository>(
  (ref) => AccountsRepository(),
);

/// الحسابات المرتبطة. قائمة فارغة تعني أن التطبيق لم يُعدّ بعد.
final accountsProvider = AsyncNotifierProvider<AccountsNotifier, List<Account>>(
  AccountsNotifier.new,
);

class AccountsNotifier extends AsyncNotifier<List<Account>> {
  @override
  Future<List<Account>> build() => ref.read(accountsRepositoryProvider).load();

  /// يضيف حساباً جديداً أو يحدّث الموجود.
  Future<void> save(Account account) async {
    final accounts = await ref.read(accountsRepositoryProvider).upsert(account);
    state = AsyncData(accounts);
  }

  Future<void> remove(String accountId) async {
    final accounts = await ref
        .read(accountsRepositoryProvider)
        .remove(accountId);
    state = AsyncData(accounts);
  }

  Future<void> clear() async {
    await ref.read(accountsRepositoryProvider).clear();
    state = const AsyncData([]);
  }
}

// ── التكاملات ────────────────────────────────────────────────────────────────

/// التكاملات النشطة، واحد لكل حساب مرتبط.
///
/// حساب يشير إلى تكامل غير معروف يُتجاهَل بدل إسقاط التطبيق.
final integrationsProvider = Provider<List<Integration>>((ref) {
  final accounts = ref.watch(accountsProvider).value ?? const <Account>[];

  final integrations = <Integration>[];
  for (final account in accounts) {
    try {
      final integration = IntegrationRegistry.create(account);
      if (integration != null) integrations.add(integration);
    } catch (_) {
      // اعتمادات ناقصة أو تالفة: نتخطّى الحساب ونُبقي البقية تعمل.
    }
  }

  ref.onDispose(() {
    for (final integration in integrations) {
      integration.dispose();
    }
  });

  return integrations;
});

final deviceRepositoryProvider = Provider<DeviceRepository>((ref) {
  final repository = DeviceRepository(ref.watch(integrationsProvider));
  ref.onDispose(repository.clearCache);
  return repository;
});

// ── حالة على مستوى التطبيق ───────────────────────────────────────────────────

/// هل التطبيق في المقدّمة؟ نوقف التحديث الدوري في الخلفية توفيراً
/// لحصة الـ API وللبطارية.
final appActiveProvider = StateProvider<bool>((ref) => true);
