import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:jisr/data/integrations/tuya/tuya_config.dart';
import 'package:jisr/data/integrations/tuya/tuya_errors.dart';
import 'package:jisr/data/integrations/tuya/tuya_signer.dart';
import 'package:jisr/data/integrations/tuya/tuya_token.dart';
import 'package:jisr/domain/integration_exception.dart';

/// عميل HTTP موقّع لـ Tuya Cloud OpenAPI.
///
/// مسؤولياته الثلاث:
/// 1. توقيع كل طلب (HMAC-SHA256).
/// 2. جلب التوكن وتجديده، مع منع الطلبات المتوازية من جلبه مرّات.
/// 3. فكّ ظرف `{success, code, msg, result}` ورمي [IntegrationException].
class TuyaClient {
  TuyaClient({
    required this.accessId,
    required this.accessSecret,
    required TuyaDataCenter dataCenter,
    Dio? dio,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: dataCenter.baseUrl,
               connectTimeout: TuyaTuning.requestTimeout,
               receiveTimeout: TuyaTuning.requestTimeout,
               sendTimeout: TuyaTuning.requestTimeout,
               // نتولّى تفسير الأخطاء: Tuya ترسل 200 مع success=false.
               validateStatus: (_) => true,
             ),
           );

  final String accessId;
  final String accessSecret;
  final Dio _dio;

  TuyaToken? _token;
  Future<TuyaToken>? _tokenInFlight;

  Future<Object?> get(String path, {Map<String, String>? query}) =>
      _send('GET', path, query: query);

  Future<Object?> post(String path, {Map<String, dynamic>? body}) =>
      _send('POST', path, body: body);

  void dispose() => _dio.close(force: true);

  // ── الداخل ────────────────────────────────────────────────────────────────

  Future<Object?> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Map<String, dynamic>? body,
    bool allowRetry = true,
  }) async {
    final token = await _ensureToken();
    final bodyText = body == null ? null : jsonEncode(body);

    try {
      final response = await _dio.request<Object?>(
        path,
        data: bodyText,
        queryParameters: query,
        options: Options(
          method: method,
          headers: TuyaSigner.headers(
            clientId: accessId,
            secret: accessSecret,
            timestampMs: DateTime.now().millisecondsSinceEpoch,
            method: method,
            path: path,
            query: query,
            body: bodyText,
            accessToken: token.accessToken,
          ),
        ),
      );
      return _unwrap(response.data);
    } on IntegrationException catch (error) {
      // توكن منتهٍ رغم حسابنا المحلي: نجدّده ونعيد المحاولة مرة واحدة فقط.
      if (error.isAuthProblem && allowRetry) {
        _token = null;
        return _send(method, path, query: query, body: body, allowRetry: false);
      }
      rethrow;
    } on DioException catch (error) {
      throw TuyaErrors.network(error.message);
    }
  }

  Future<TuyaToken> _ensureToken() async {
    final current = _token;
    if (current != null && !current.needsRefresh) return current;

    // طلبات متوازية كثيرة تصل هنا معاً؛ نجلب التوكن مرة واحدة ونشاركه.
    return _tokenInFlight ??= _fetchToken().whenComplete(() {
      _tokenInFlight = null;
    });
  }

  /// نجلب توكناً جديداً بدل استخدام `refresh_token`.
  ///
  /// في وضع المشروع الاستدعاء رخيص ولا يحتاج حالة سابقة، وهذا يتجنّب
  /// حالة عالقة عند انتهاء `refresh_token` بدوره.
  Future<TuyaToken> _fetchToken() async {
    const path = TuyaPaths.token;
    const query = {'grant_type': '1'};

    try {
      final response = await _dio.get<Object?>(
        path,
        queryParameters: query,
        options: Options(
          headers: TuyaSigner.headers(
            clientId: accessId,
            secret: accessSecret,
            timestampMs: DateTime.now().millisecondsSinceEpoch,
            method: 'GET',
            path: path,
            query: query,
          ),
        ),
      );

      final result = _unwrap(response.data);
      if (result is! Map) {
        throw TuyaErrors.malformed('استجابة توكن غير متوقعة من Tuya.');
      }

      final token = TuyaToken.fromResult(Map<String, dynamic>.from(result));
      if (token.accessToken.isEmpty) {
        throw TuyaErrors.malformed('لم يُرجع Tuya توكن وصول صالحاً.');
      }
      _token = token;
      return token;
    } on DioException catch (error) {
      throw TuyaErrors.network(error.message);
    }
  }

  /// يفكّ ظرف Tuya ويرمي عند الفشل.
  Object? _unwrap(Object? data) {
    // مع `validateStatus` مفتوحاً قد تصل صفحة خطأ نصية بدل JSON.
    if (data is String) {
      try {
        data = jsonDecode(data);
      } on FormatException {
        throw TuyaErrors.malformed('استجابة غير مفهومة من الخادم.');
      }
    }

    if (data is! Map) {
      throw TuyaErrors.malformed('استجابة غير متوقعة من الخادم.');
    }

    final envelope = Map<String, dynamic>.from(data);
    if (envelope['success'] == true) return envelope['result'];

    throw TuyaErrors.from(
      (envelope['code'] as num?)?.toInt(),
      envelope['msg'] as String?,
    );
  }
}
