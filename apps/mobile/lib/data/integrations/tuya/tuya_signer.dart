/// توقيع طلبات Tuya Cloud OpenAPI — HMAC-SHA256.
///
/// **Dart خالص عمداً**: لا يستورد Flutter، حتى يعمل داخل `tool/tuya_probe.dart`
/// كسكربت مستقل وحتى تبقى اختباراته سريعة.
///
/// الخوارزمية (حسب توثيق Tuya):
/// ```
/// stringToSign = METHOD \n SHA256(body) \n signHeaders \n url
/// str          = clientId + [accessToken] + t + nonce + stringToSign
/// sign         = HMAC-SHA256(str, secret).toUpperCase()
/// ```
/// `accessToken` يُحذف من `str` في طلبات الحصول على التوكن نفسه.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';

class TuyaSigner {
  const TuyaSigner._();

  /// SHA-256 لجسم فارغ — ثابت متكرر، نحسبه مرة واحدة.
  static const String emptyBodySha256 =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  static String sha256Hex(String input) =>
      sha256.convert(utf8.encode(input)).toString();

  /// المسار مع معاملات الاستعلام مرتّبة أبجدياً — الترتيب جزء من التوقيع.
  static String canonicalUrl(String path, [Map<String, String>? query]) {
    if (query == null || query.isEmpty) return path;
    final keys = query.keys.toList()..sort();
    final pairs = keys.map((k) => '$k=${query[k]}').join('&');
    return '$path?$pairs';
  }

  static String stringToSign({
    required String method,
    required String path,
    Map<String, String>? query,
    String? body,
  }) {
    final contentHash = (body == null || body.isEmpty)
        ? emptyBodySha256
        : sha256Hex(body);
    // السطر الثالث (signHeaders) فارغ لأننا لا نستخدم ترويسة Signature-Headers.
    return '${method.toUpperCase()}\n$contentHash\n\n${canonicalUrl(path, query)}';
  }

  static String sign({
    required String clientId,
    required String secret,
    required int timestampMs,
    required String method,
    required String path,
    Map<String, String>? query,
    String? body,
    String? accessToken,
    String nonce = '',
  }) {
    final payload =
        '$clientId'
        '${accessToken ?? ''}'
        '$timestampMs'
        '$nonce'
        '${stringToSign(method: method, path: path, query: query, body: body)}';

    final digest = Hmac(
      sha256,
      utf8.encode(secret),
    ).convert(utf8.encode(payload));
    return digest.toString().toUpperCase();
  }

  /// الترويسات الكاملة لطلب موقّع، جاهزة للإرسال.
  static Map<String, String> headers({
    required String clientId,
    required String secret,
    required int timestampMs,
    required String method,
    required String path,
    Map<String, String>? query,
    String? body,
    String? accessToken,
    String nonce = '',
  }) {
    final signature = sign(
      clientId: clientId,
      secret: secret,
      timestampMs: timestampMs,
      method: method,
      path: path,
      query: query,
      body: body,
      accessToken: accessToken,
      nonce: nonce,
    );

    return {
      'client_id': clientId,
      'sign': signature,
      't': '$timestampMs',
      'sign_method': 'HMAC-SHA256',
      if (nonce.isNotEmpty) 'nonce': nonce,
      'access_token': ?accessToken,
      'Content-Type': 'application/json',
    };
  }
}
