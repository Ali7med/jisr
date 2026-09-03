import 'package:dio/dio.dart';
import 'package:jisr/config/app_config.dart';
import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/data/api/session_store.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/app_notification.dart';
import 'package:jisr/domain/models/automation.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_snapshot.dart';
import 'package:jisr/domain/models/device_state.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/domain/models/scene.dart';

/// عميل سيرفر جسر — **الطريق الوحيد للبيانات** بعد [ADR-0009].
///
/// مسؤولياته الثلاث:
/// 1. حمل رمز الوصول وتجديده تلقائياً مرة واحدة عند انتهائه.
/// 2. تحويل استجابات العقد إلى نماذج المجال.
/// 3. تحويل أخطاء السيرفر إلى [ApiException] برسالتها العربية كما هي.
class JisrApiClient {
  JisrApiClient({Dio? dio, SessionStore? store})
    : _store = store ?? SessionStore(),
      _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: AppConfig.serverUrl,
              connectTimeout: AppTuning.requestTimeout,
              receiveTimeout: AppTuning.requestTimeout,
              sendTimeout: AppTuning.requestTimeout,
              // نتولّى تفسير الأخطاء بأنفسنا: عقد ApiError يحمل الرسالة.
              validateStatus: (_) => true,
            ),
          );

  final Dio _dio;
  final SessionStore _store;

  /// الجلسة الحالية في الذاكرة — تُقرأ من المخزن الآمن عند الإقلاع.
  Session? _session;

  Session? get session => _session;
  bool get isAuthenticated => _session != null;

  // ── المصادقة ──────────────────────────────────────────────────────────────

  Future<Session> register({
    required String email,
    required String password,
    required String displayName,
  }) => _startSession('/auth/register', {
    'email': email,
    'password': password,
    'displayName': displayName,
  });

  Future<Session> login({required String email, required String password}) =>
      _startSession('/auth/login', {'email': email, 'password': password});

  Future<Session> _startSession(String path, Map<String, dynamic> body) async {
    final data = _unwrap(await _post(path, body, authenticated: false));
    final tokens = _asMap(data['tokens']);
    final user = _asMap(data['user']);

    final session = Session(
      accessToken: tokens['accessToken'] as String? ?? '',
      refreshToken: tokens['refreshToken'] as String? ?? '',
      email: user['email'] as String? ?? '',
      displayName: user['displayName'] as String? ?? '',
    );
    if (session.accessToken.isEmpty) {
      throw const ApiException('استجابة دخول غير متوقّعة من الخادم.');
    }

    await _store.write(session);
    _session = session;
    return session;
  }

  /// يُنهي الجلسة محلياً **دائماً**، حتى لو تعذّر إبلاغ السيرفر: مستخدم
  /// ضغط «خروج» يجب أن يخرج، لا أن يعلق بسبب انقطاع شبكة.
  Future<void> logout() async {
    final refreshToken = _session?.refreshToken;
    _session = null;
    await _store.clear();

    if (refreshToken == null) return;
    try {
      await _post('/auth/logout', {
        'refreshToken': refreshToken,
      }, authenticated: false);
    } catch (_) {
      /* تجاهُل مقصود */
    }
  }

  /// يستعيد جلسة محفوظة عند الإقلاع.
  Future<Session?> restore() async {
    _session = await _store.read();
    return _session;
  }

  // ── التكاملات والحسابات ───────────────────────────────────────────────────

  Future<List<IntegrationInfo>> fetchIntegrations() async {
    final data = _unwrap(await _get('/integrations'));
    return _list(data['integrations'], IntegrationInfo.fromJson);
  }

  Future<List<Account>> fetchAccounts() async {
    final data = _unwrap(await _get('/accounts'));
    return _list(data['accounts'], Account.fromJson);
  }

  /// يربط حساباً. **الاعتمادات تُرسل مرة واحدة ولا تُحفظ على الجهاز.**
  Future<Account> createAccount({
    required String integrationId,
    required String label,
    required Map<String, String> credentials,
  }) async {
    final data = _unwrap(
      await _post('/accounts', {
        'integrationId': integrationId,
        'label': label,
        'credentials': credentials,
      }),
    );
    return Account.fromJson(data);
  }

  Future<Account> updateAccount(
    String accountId, {
    String? label,
    Map<String, String>? credentials,
  }) async {
    final data = _unwrap(
      await _request(
        'PATCH',
        '/accounts/$accountId',
        body: {'label': ?label, 'credentials': ?credentials},
      ),
    );
    return Account.fromJson(data);
  }

  Future<void> deleteAccount(String accountId) async {
    await _request('DELETE', '/accounts/$accountId');
  }

  Future<void> syncAccount(String accountId) async {
    await _post('/accounts/$accountId/sync', const {});
  }

  // ── الأجهزة ───────────────────────────────────────────────────────────────

  Future<List<Device>> fetchDevices() async {
    final data = _unwrap(await _get('/devices'));
    return _list(data['devices'], Device.fromJson);
  }

  Future<DeviceSnapshot> fetchSnapshot(String deviceId) async {
    final data = _unwrap(await _get('/devices/$deviceId'));
    final deviceJson = _asMap(data['device']);

    return DeviceSnapshot(
      device: Device.fromJson(deviceJson),
      capabilities: _list(deviceJson['capabilities'], Capability.fromJson),
      values: {
        for (final state in _list(data['values'], StateValue.fromJson))
          state.key: state.value,
      },
    );
  }

  Future<void> sendCommands(String deviceId, List<Command> commands) async {
    await _post('/devices/$deviceId/commands', {
      'commands': [
        for (final command in commands)
          {'key': command.key, 'value': command.value},
      ],
    });
  }

  Future<List<HistoryPoint>> fetchHistory(
    String deviceId, {
    required List<String> keys,
    required Duration window,
    int limit = 200,
  }) async {
    final end = DateTime.now().toUtc();
    final data = _unwrap(
      await _get(
        '/devices/$deviceId/history',
        query: {
          if (keys.isNotEmpty) 'keys': keys.join(','),
          'start': end.subtract(window).toIso8601String(),
          'end': end.toIso8601String(),
          'limit': '$limit',
        },
      ),
    );
    return _list(data['points'], HistoryPoint.fromJson);
  }

  // ── المشاهد ───────────────────────────────────────────────────────────────

  Future<List<Scene>> fetchScenes() async {
    final data = _unwrap(await _get('/scenes'));
    return _list(data['scenes'], Scene.fromJson);
  }

  /// يشغّل مشهداً ويُعيد نتيجته **كاملة**.
  ///
  /// لا نختصرها إلى نجاح/فشل: المشهد قد ينفّذ ثلاث خطوات ويفشل في رابعة،
  /// والشاشة تحتاج أسماء ما فشل وسببه كي تقول الحقيقة للمستخدم.
  Future<SceneRunResult> runScene(String sceneId) async {
    final data = _unwrap(await _post('/scenes/$sceneId/run', const {}));
    return SceneRunResult.fromJson(data);
  }

  // ── الإشعارات ─────────────────────────────────────────────────────────────

  Future<NotificationFeed> fetchNotifications() async {
    final data = _unwrap(await _get('/notifications'));
    return NotificationFeed(
      items: _list(data['notifications'], AppNotification.fromJson),
      unread: (data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markNotificationsRead() async {
    await _post('/notifications/read', const {});
  }

  // ── الأتمتة ───────────────────────────────────────────────────────────────

  Future<List<Automation>> fetchAutomations() async {
    final data = _unwrap(await _get('/automations'));
    return _list(data['automations'], Automation.fromJson);
  }

  /// سجلّ تنفيذ أتمتة واحدة — يُطلب عند فتحها لا مع القائمة كلها.
  Future<List<AutomationRun>> fetchAutomationRuns(String automationId) async {
    final data = _unwrap(await _get('/automations/$automationId/runs'));
    return _list(data['runs'], AutomationRun.fromJson);
  }

  // ── الداخل ────────────────────────────────────────────────────────────────

  Future<Response<Object?>> _get(String path, {Map<String, String>? query}) =>
      _request('GET', path, query: query);

  Future<Response<Object?>> _post(
    String path,
    Map<String, dynamic> body, {
    bool authenticated = true,
  }) => _request('POST', path, body: body, authenticated: authenticated);

  Future<Response<Object?>> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Map<String, dynamic>? body,
    bool authenticated = true,
    bool allowRefresh = true,
  }) async {
    late Response<Object?> response;
    try {
      response = await _dio.request<Object?>(
        path,
        data: body,
        queryParameters: query,
        options: Options(
          method: method,
          headers: {
            if (authenticated && _session != null)
              'Authorization': 'Bearer ${_session!.accessToken}',
          },
        ),
      );
    } on DioException catch (error) {
      throw ApiException.offline(error.message);
    }

    // رمز وصول منتهٍ: نجدّد مرة واحدة ثم نعيد الطلب. فشل التجديد يعني
    // انتهاء الجلسة فعلاً — نمسحها كي تعود الواجهة لشاشة الدخول.
    if (response.statusCode == 401 && authenticated && allowRefresh) {
      if (await _refresh()) {
        return _request(
          method,
          path,
          query: query,
          body: body,
          authenticated: authenticated,
          allowRefresh: false,
        );
      }
    }

    if ((response.statusCode ?? 500) >= 400) throw _toException(response);
    return response;
  }

  Future<bool> _refresh() async {
    final current = _session;
    if (current == null) return false;

    try {
      final response = await _dio.post<Object?>(
        '/auth/refresh',
        data: {'refreshToken': current.refreshToken},
      );
      if ((response.statusCode ?? 500) >= 400) {
        await logout();
        return false;
      }

      final tokens = _asMap(response.data);
      final renewed = current.copyWith(
        accessToken: tokens['accessToken'] as String? ?? '',
        refreshToken: tokens['refreshToken'] as String? ?? '',
      );
      if (renewed.accessToken.isEmpty) {
        await logout();
        return false;
      }

      await _store.write(renewed);
      _session = renewed;
      return true;
    } on DioException {
      // انقطاع شبكة ليس انتهاء جلسة: نُبقيها ونترك الطلب يفشل بـ offline.
      return false;
    }
  }

  ApiException _toException(Response<Object?> response) {
    final status = response.statusCode ?? 500;
    final data = response.data;
    final body = data is Map
        ? Map<String, dynamic>.from(data)
        : const <String, dynamic>{};

    return ApiException(
      body['message'] as String? ?? 'تعذّر إتمام الطلب. حاول بعد قليل.',
      code: body['code'] as String? ?? 'HTTP_$status',
      status: status,
      kind: switch (status) {
        401 => ApiErrorKind.unauthorized,
        404 => ApiErrorKind.notFound,
        400 => ApiErrorKind.invalid,
        >= 500 => ApiErrorKind.server,
        _ => ApiErrorKind.unknown,
      },
    );
  }

  Map<String, dynamic> _unwrap(Response<Object?> response) =>
      _asMap(response.data);

  Map<String, dynamic> _asMap(Object? value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  List<T> _list<T>(Object? raw, T Function(Map<String, dynamic>) parse) => [
    if (raw is List)
      for (final item in raw)
        if (item is Map) parse(Map<String, dynamic>.from(item)),
  ];
}
