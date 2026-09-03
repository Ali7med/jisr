import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/data/api/jisr_api_client.dart';
import 'package:jisr/data/api/realtime_client.dart';
import 'package:jisr/data/api/session_store.dart';
import 'package:jisr/data/repositories/device_repository.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/app_notification.dart';
import 'package:jisr/domain/models/automation.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/domain/models/scene.dart';

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

/// الإشعارات الواردة على القناة — تغذّي [notificationsProvider] وحده.
final notificationEventsProvider = StreamProvider<AppNotification>((ref) {
  return ref.watch(realtimeProvider).notifications;
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

// ── المشاهد ──────────────────────────────────────────────────────────────────

final scenesProvider = AsyncNotifierProvider<ScenesNotifier, List<Scene>>(
  ScenesNotifier.new,
);

class ScenesNotifier extends AsyncNotifier<List<Scene>> {
  @override
  Future<List<Scene>> build() async {
    if (ref.watch(sessionProvider).value == null) return const [];
    return ref.read(apiClientProvider).fetchScenes();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(ref.read(apiClientProvider).fetchScenes);
  }

  /// التشغيل لا يغيّر قائمة المشاهد، فالنتيجة تُعاد للشاشة بدل ابتلاعها في
  /// الحالة: النجاح الجزئي رسالة للمستخدم لا حالة معروضة.
  Future<SceneRunResult> run(String sceneId) =>
      ref.read(apiClientProvider).runScene(sceneId);
}

// ── الإشعارات ────────────────────────────────────────────────────────────────

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, NotificationFeed>(
      NotificationsNotifier.new,
    );

class NotificationsNotifier extends AsyncNotifier<NotificationFeed> {
  @override
  Future<NotificationFeed> build() async {
    if (ref.watch(sessionProvider).value == null) {
      return NotificationFeed.empty;
    }

    // الإشعار الوارد يُضاف فوراً بدل انتظار جلب تالٍ: الشارة على شريط
    // الأجهزة يجب أن تتحرّك لحظة وقوع الحدث لا حين يفتح المستخدم الشاشة.
    ref.listen(notificationEventsProvider, (_, next) {
      final incoming = next.value;
      if (incoming != null) _prepend(incoming);
    });

    return ref.read(apiClientProvider).fetchNotifications();
  }

  void _prepend(AppNotification incoming) {
    final current = state.value;
    if (current == null) return;

    // القناة قد تُعيد إرسال ما وصل قبل قطع الاتصال؛ تكراره يعني عدّاداً
    // كاذباً وسطراً مكرّراً في القائمة.
    if (current.items.any((item) => item.id == incoming.id)) return;

    state = AsyncData(current.withIncoming(incoming));
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      ref.read(apiClientProvider).fetchNotifications,
    );
  }

  /// يعلّم الكل كمقروء. لا نعيد الجلب بعدها: السيرفر لا يُعيد شيئاً،
  /// وإعادة الجلب تومض القائمة بلا فائدة.
  Future<void> markAllRead() async {
    await ref.read(apiClientProvider).markNotificationsRead();
    final current = state.value;
    if (current != null) state = AsyncData(current.allRead());
  }
}

/// عدد غير المقروء وحده — الشارة تراقبه فلا تُعاد بناؤها مع كل تغيّر في
/// نصّ القائمة.
final unreadNotificationsProvider = Provider<int>(
  (ref) => ref.watch(notificationsProvider).value?.unread ?? 0,
);

// ── الأتمتة ──────────────────────────────────────────────────────────────────

/// قائمة الأتمتة — قراءة فقط في هذا الإصدار.
final automationsProvider = FutureProvider<List<Automation>>((ref) async {
  if (ref.watch(sessionProvider).value == null) return const [];
  return ref.read(apiClientProvider).fetchAutomations();
});

/// سجلّ تنفيذ أتمتة بعينها — يُجلب عند فتح بطاقتها فقط، فقائمة من عشرين
/// أتمتة لا تعني عشرين طلباً عند الدخول.
final automationRunsProvider =
    FutureProvider.family<List<AutomationRun>, String>(
      (ref, automationId) =>
          ref.watch(apiClientProvider).fetchAutomationRuns(automationId),
    );
