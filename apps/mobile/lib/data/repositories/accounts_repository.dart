import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:jisr/domain/models/account.dart';

/// تخزين الحسابات المرتبطة في مخزن النظام الآمن (Keystore على أندرويد).
///
/// الحسابات تحوي أسراراً، فلا تُكتب في SharedPreferences ولا في أي ملف
/// داخل المستودع.
class AccountsRepository {
  AccountsRepository({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          // EncryptedSharedPreferences يشفّر المفتاح والقيمة معاً عبر Keystore.
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
          );

  static const String _key = 'jisr_accounts_v1';

  final FlutterSecureStorage _storage;

  Future<List<Account>> load() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return const [];

      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];

      return decoded
          .whereType<Map<Object?, Object?>>()
          .map(Map<String, dynamic>.from)
          .map(Account.fromJson)
          .where((a) => a.id.isNotEmpty && a.integrationId.isNotEmpty)
          .toList();
    } catch (_) {
      // مخزن تالف أو بصيغة قديمة: نتعامل معه كأنه فارغ بدل إسقاط التطبيق.
      return const [];
    }
  }

  Future<void> saveAll(List<Account> accounts) => _storage.write(
    key: _key,
    value: jsonEncode([for (final a in accounts) a.toJson()]),
  );

  /// يضيف حساباً أو يستبدل الموجود بنفس المعرّف.
  Future<List<Account>> upsert(Account account) async {
    final accounts = [...await load()];
    final index = accounts.indexWhere((a) => a.id == account.id);

    if (index >= 0) {
      accounts[index] = account;
    } else {
      accounts.add(account);
    }

    await saveAll(accounts);
    return accounts;
  }

  Future<List<Account>> remove(String accountId) async {
    final accounts = [...await load()]..removeWhere((a) => a.id == accountId);
    await saveAll(accounts);
    return accounts;
  }

  Future<void> clear() => _storage.delete(key: _key);

  /// معرّف حساب جديد — مشتقّ من التكامل والوقت، فريد عملياً.
  static String newId(String integrationId) =>
      '$integrationId-${DateTime.now().millisecondsSinceEpoch}';
}
