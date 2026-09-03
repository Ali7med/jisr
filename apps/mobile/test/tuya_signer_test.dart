import 'package:flutter_test/flutter_test.dart';
import 'package:jisr/data/integrations/tuya/tuya_signer.dart';

/// التواقيع المتوقّعة أدناه حُسبت خارجياً بـ `openssl dgst -sha256 -hmac`،
/// فالاختبار يقارن تنفيذنا بمرجع مستقل لا بنفسه.
void main() {
  const clientId = 'testclientid';
  const secret = 'testsecret';
  const timestamp = 1700000000000;

  group('TuyaSigner — اللبنات', () {
    test('تجزئة الجسم الفارغ ثابتة ومطابقة لـ SHA-256("")', () {
      expect(
        TuyaSigner.emptyBodySha256,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(TuyaSigner.sha256Hex(''), TuyaSigner.emptyBodySha256);
    });

    test('معاملات الاستعلام تُرتَّب أبجدياً', () {
      expect(
        TuyaSigner.canonicalUrl('/v1.0/devices/x/logs', {
          'size': '100',
          'end_time': '2',
          'start_time': '1',
        }),
        '/v1.0/devices/x/logs?end_time=2&size=100&start_time=1',
      );
    });

    test('مسار بلا معاملات يبقى كما هو', () {
      expect(TuyaSigner.canonicalUrl('/v1.0/token'), '/v1.0/token');
      expect(TuyaSigner.canonicalUrl('/v1.0/token', const {}), '/v1.0/token');
    });

    test('stringToSign يتبع بنية Tuya رباعية الأسطر', () {
      final result = TuyaSigner.stringToSign(
        method: 'get',
        path: '/v1.0/token',
        query: const {'grant_type': '1'},
      );

      expect(
        result,
        'GET\n'
        '${TuyaSigner.emptyBodySha256}\n'
        '\n'
        '/v1.0/token?grant_type=1',
      );
    });
  });

  group('TuyaSigner — التوقيع', () {
    test('طلب التوكن: بدون access_token في السلسلة', () {
      expect(
        TuyaSigner.sign(
          clientId: clientId,
          secret: secret,
          timestampMs: timestamp,
          method: 'GET',
          path: '/v1.0/token',
          query: const {'grant_type': '1'},
        ),
        'F40118B314E9CBBE12E6EE8A8E0D57CEC7B633B961992149FC4F21AF0A6FEEAD',
      );
    });

    test('طلب أعمال بجسم: يشمل access_token وتجزئة الجسم', () {
      const body = '{"commands":[{"code":"switch_1","value":true}]}';

      expect(
        TuyaSigner.sha256Hex(body),
        '00c2368c059275b6f529e038fc079d641a933173858053bf72070d768d072f0e',
      );
      expect(
        TuyaSigner.sign(
          clientId: clientId,
          secret: secret,
          timestampMs: timestamp,
          method: 'POST',
          path: '/v1.0/devices/abc123/commands',
          body: body,
          accessToken: 'tok-xyz',
        ),
        '40CDD4C5A7A5815698BBF348952FE9307752907FFEEC3FD17EC3635068A67F0F',
      );
    });

    test('التوقيع بأحرف كبيرة دائماً', () {
      final signature = TuyaSigner.sign(
        clientId: clientId,
        secret: secret,
        timestampMs: timestamp,
        method: 'GET',
        path: '/v1.0/token',
      );
      expect(signature, signature.toUpperCase());
      expect(signature, hasLength(64));
    });

    test('تغيّر الطابع الزمني يغيّر التوقيع', () {
      String signAt(int t) => TuyaSigner.sign(
            clientId: clientId,
            secret: secret,
            timestampMs: t,
            method: 'GET',
            path: '/v1.0/token',
          );

      expect(signAt(timestamp), isNot(signAt(timestamp + 1)));
    });

    test('ترتيب إدخال المعاملات لا يؤثّر على التوقيع', () {
      String signWith(Map<String, String> query) => TuyaSigner.sign(
            clientId: clientId,
            secret: secret,
            timestampMs: timestamp,
            method: 'GET',
            path: '/v1.0/devices/x/logs',
            query: query,
          );

      expect(signWith({'a': '1', 'b': '2'}), signWith({'b': '2', 'a': '1'}));
    });
  });

  group('TuyaSigner — الترويسات', () {
    test('طلب التوكن لا يحمل ترويسة access_token', () {
      final headers = TuyaSigner.headers(
        clientId: clientId,
        secret: secret,
        timestampMs: timestamp,
        method: 'GET',
        path: '/v1.0/token',
        query: const {'grant_type': '1'},
      );

      expect(headers['client_id'], clientId);
      expect(headers['sign_method'], 'HMAC-SHA256');
      expect(headers['t'], '$timestamp');
      expect(headers.containsKey('access_token'), isFalse);
      expect(headers.containsKey('nonce'), isFalse);
    });

    test('طلب الأعمال يحمل access_token', () {
      final headers = TuyaSigner.headers(
        clientId: clientId,
        secret: secret,
        timestampMs: timestamp,
        method: 'GET',
        path: '/v1.0/devices/abc/status',
        accessToken: 'tok-xyz',
      );

      expect(headers['access_token'], 'tok-xyz');
    });

    test('nonce غير الفارغ يُرسَل ويغيّر التوقيع', () {
      Map<String, String> build(String nonce) => TuyaSigner.headers(
            clientId: clientId,
            secret: secret,
            timestampMs: timestamp,
            method: 'GET',
            path: '/v1.0/token',
            nonce: nonce,
          );

      final without = build('');
      final with_ = build('abc');

      expect(without.containsKey('nonce'), isFalse);
      expect(with_['nonce'], 'abc');
      expect(without['sign'], isNot(with_['sign']));
    });
  });
}
