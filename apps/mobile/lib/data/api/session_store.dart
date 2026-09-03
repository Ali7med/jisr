import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// جلسة المستخدم: رمز وصول ورمز تجديد.
class Session {
  const Session({
    required this.accessToken,
    required this.refreshToken,
    required this.email,
    required this.displayName,
  });

  final String accessToken;
  final String refreshToken;
  final String email;
  final String displayName;

  Session copyWith({String? accessToken, String? refreshToken}) => Session(
    accessToken: accessToken ?? this.accessToken,
    refreshToken: refreshToken ?? this.refreshToken,
    email: email,
    displayName: displayName,
  );

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'email': email,
    'displayName': displayName,
  };

  static Session? fromJson(Map<String, dynamic> json) {
    final accessToken = json['accessToken'] as String? ?? '';
    final refreshToken = json['refreshToken'] as String? ?? '';
    if (accessToken.isEmpty || refreshToken.isEmpty) return null;

    return Session(
      accessToken: accessToken,
      refreshToken: refreshToken,
      email: json['email'] as String? ?? '',
      displayName: json['displayName'] as String? ?? '',
    );
  }

  /// لا يطبع الرموز أبداً.
  @override
  String toString() => 'Session($email)';
}

/// تخزين الجلسة في مخزن النظام الآمن (Keystore على أندرويد).
///
/// **هذا كل ما يبقى من أسرار على الجهاز** بعد [ADR-0009]: لا مفاتيح
/// Tuya ولا اعتمادات أي شركة — تلك تعيش مشفّرة على السيرفر وحده.
class SessionStore {
  SessionStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
          );

  static const String _key = 'jisr_session_v1';

  final FlutterSecureStorage _storage;

  Future<Session?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return null;

      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      return Session.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      // مخزن تالف أو بصيغة قديمة: نتعامل معه كأنه فارغ لا كأنه عطل.
      return null;
    }
  }

  Future<void> write(Session session) =>
      _storage.write(key: _key, value: jsonEncode(session.toJson()));

  Future<void> clear() => _storage.delete(key: _key);
}
