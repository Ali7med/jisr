import 'package:jisr/data/integrations/tuya/tuya_config.dart';

/// توكن وصول Tuya مع لحظة انتهائه المحسوبة محلياً.
class TuyaToken {
  const TuyaToken({
    required this.accessToken,
    required this.refreshToken,
    required this.uid,
    required this.expiresAt,
  });

  final String accessToken;
  final String refreshToken;

  /// قد يعود فارغاً في وضع المشروع (simple mode).
  final String uid;

  final DateTime expiresAt;

  /// نعتبره منتهياً قبل الوقت بهامش أمان لتفادي سباق الزمن مع الخادم.
  bool get needsRefresh =>
      DateTime.now().isAfter(expiresAt.subtract(TuyaTuning.tokenRefreshMargin));

  /// `result` من استجابة `/v1.0/token`.
  factory TuyaToken.fromResult(Map<String, dynamic> result) {
    final expireSeconds = (result['expire_time'] as num?)?.toInt() ?? 7200;
    return TuyaToken(
      accessToken: result['access_token'] as String? ?? '',
      refreshToken: result['refresh_token'] as String? ?? '',
      uid: result['uid'] as String? ?? '',
      expiresAt: DateTime.now().add(Duration(seconds: expireSeconds)),
    );
  }

  @override
  String toString() => 'TuyaToken(uid: $uid, expiresAt: $expiresAt)';
}
