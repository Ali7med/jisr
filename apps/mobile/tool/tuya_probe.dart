/// سكربت استكشاف أجهزة Tuya — المرحلة 1 من الخطة.
///
/// يتحقّق من صحة المفاتيح والتوقيع، ثم يوثّق كل جهاز وكل نقاط بياناته
/// في `docs/devices_dump.json`. مخرجاته هي ما يحدّد شكل الواجهة.
///
/// التشغيل:
/// ```
/// dart run tool/tuya_probe.dart --id <ACCESS_ID> --secret <SECRET> \
///   --uid <UID> --host openapi.tuyaeu.com
/// ```
/// أو عبر متغيرات البيئة `TUYA_ID` و`TUYA_SECRET` و`TUYA_UID` و`TUYA_HOST`.
///
/// **لا تكتب المفاتيح داخل هذا الملف.**
library;

import 'dart:convert';
import 'dart:io';

import 'package:jisr/data/integrations/tuya/tuya_signer.dart';

Future<void> main(List<String> args) async {
  final options = _parseArgs(args);

  final accessId = options['id'] ?? Platform.environment['TUYA_ID'];
  final secret = options['secret'] ?? Platform.environment['TUYA_SECRET'];
  final uid = options['uid'] ?? Platform.environment['TUYA_UID'];
  final host =
      options['host'] ??
      Platform.environment['TUYA_HOST'] ??
      'openapi.tuyaeu.com';

  if (accessId == null || secret == null || uid == null) {
    stderr.writeln('''
ينقص معامل مطلوب.

  dart run tool/tuya_probe.dart --id <ACCESS_ID> --secret <SECRET> \\
    --uid <UID> [--host openapi.tuyaeu.com]

المضيفات المتاحة:
  openapi.tuyaeu.com        أوروبا الوسطى
  openapi-weaz.tuyaeu.com   أوروبا الغربية
  openapi.tuyaus.com        أمريكا الغربية
  openapi-ueaz.tuyaus.com   أمريكا الشرقية
  openapi.tuyacn.com        الصين
  openapi.tuyain.com        الهند
''');
    exitCode = 64;
    return;
  }

  final probe = _Probe(
    accessId: accessId,
    secret: secret,
    uid: uid,
    host: host,
  );

  try {
    await probe.run();
  } finally {
    probe.close();
  }
}

class _Probe {
  _Probe({
    required this.accessId,
    required this.secret,
    required this.uid,
    required this.host,
  });

  final String accessId;
  final String secret;
  final String uid;
  final String host;

  final HttpClient _http = HttpClient();
  String? _token;

  void close() => _http.close(force: true);

  Future<void> run() async {
    _step('١', 'جلب التوكن من $host');
    _token = await _fetchToken();
    _ok('التوقيع صحيح ومركز البيانات صحيح');

    _step('٢', 'جلب قائمة الأجهزة');
    final devices = await _get('/v1.0/users/$uid/devices');
    if (devices is! List || devices.isEmpty) {
      _warn(
        'لا توجد أجهزة. تأكد من ربط حساب Smart Life بالمشروع '
        'ومن صحة الـ UID.',
      );
      return;
    }
    _ok('${devices.length} جهاز');

    _step('٣', 'جلب المواصفات والحالة لكل جهاز');
    final dump = <Map<String, dynamic>>[];

    for (final raw in devices.whereType<Map<Object?, Object?>>()) {
      final device = Map<String, dynamic>.from(raw);
      final id = device['id'] as String? ?? '';
      final name = device['name'] as String? ?? '(بلا اسم)';
      if (id.isEmpty) continue;

      stdout.write('   • $name … ');
      try {
        final spec = await _get('/v1.0/devices/$id/specifications');
        final status = await _get('/v1.0/devices/$id/status');

        dump.add({
          'id': id,
          'name': name,
          'category': device['category'],
          'product_name': device['product_name'],
          'model': device['model'],
          'online': device['online'],
          'sub': device['sub'],
          'specifications': spec,
          'status': status,
        });
        stdout.writeln('تم');
      } catch (error) {
        stdout.writeln('فشل: $error');
        dump.add({'id': id, 'name': name, 'error': '$error'});
      }
    }

    _step('٤', 'حفظ النتائج');
    final file = File('docs/devices_dump.json');
    await file.parent.create(recursive: true);
    await file.writeAsString(const JsonEncoder.withIndent('  ').convert(dump));
    _ok('docs/devices_dump.json (${dump.length} جهاز)');

    _summary(dump);
  }

  /// ملخّص سريع يجيب على السؤال المهم: أي DP سنعرضه وكيف؟
  void _summary(List<Map<String, dynamic>> dump) {
    stdout.writeln('\n── ملخّص نقاط البيانات ──');

    for (final entry in dump) {
      final spec = entry['specifications'];
      if (spec is! Map) continue;

      stdout.writeln('\n${entry['name']}  [${entry['category']}]');

      void printSet(String label, Object? set) {
        if (set is! List || set.isEmpty) {
          stdout.writeln('  $label: —');
          return;
        }
        stdout.writeln('  $label:');
        for (final item in set.whereType<Map<Object?, Object?>>()) {
          final code = item['code'];
          final type = item['type'];
          final values = '${item['values'] ?? ''}';
          final trimmed = values.length > 70
              ? '${values.substring(0, 70)}…'
              : values;
          stdout.writeln('    - $code ($type) $trimmed');
        }
      }

      printSet('تحكّم', spec['functions']);
      printSet('قراءة', spec['status']);
    }
  }

  Future<String> _fetchToken() async {
    final result = await _request(
      'GET',
      '/v1.0/token',
      query: const {'grant_type': '1'},
      authenticated: false,
    );

    if (result is! Map || result['access_token'] is! String) {
      throw StateError('استجابة توكن غير متوقعة: $result');
    }
    return result['access_token'] as String;
  }

  Future<Object?> _get(String path, {Map<String, String>? query}) =>
      _request('GET', path, query: query);

  Future<Object?> _request(
    String method,
    String path, {
    Map<String, String>? query,
    String? body,
    bool authenticated = true,
  }) async {
    final uri = Uri.https(host, path, query);

    final request = await _http.openUrl(method, uri);
    final headers = TuyaSigner.headers(
      clientId: accessId,
      secret: secret,
      timestampMs: DateTime.now().millisecondsSinceEpoch,
      method: method,
      path: path,
      query: query,
      body: body,
      accessToken: authenticated ? _token : null,
    );
    headers.forEach(request.headers.set);
    if (body != null) request.write(body);

    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();

    final decoded = jsonDecode(text);
    if (decoded is! Map) throw StateError('استجابة غير متوقعة: $text');

    if (decoded['success'] == true) return decoded['result'];

    throw StateError(
      'Tuya ${decoded['code']}: ${decoded['msg']}'
      '${decoded['code'] == 1106 ? '  ← غالباً مركز بيانات خاطئ أو API غير مفعّل' : ''}'
      '${decoded['code'] == 1004 ? '  ← تحقّق من Access Secret وساعة الجهاز' : ''}',
    );
  }

  void _step(String number, String text) => stdout.writeln('\n[$number] $text');
  void _ok(String text) => stdout.writeln('   ✓ $text');
  void _warn(String text) => stdout.writeln('   ! $text');
}

Map<String, String> _parseArgs(List<String> args) {
  final result = <String, String>{};
  for (var i = 0; i < args.length - 1; i++) {
    if (args[i].startsWith('--')) {
      result[args[i].substring(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}
