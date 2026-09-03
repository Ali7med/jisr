import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  EMPTY_BODY_SHA256,
  sha256Hex,
  sign,
  signedHeaders,
  stringToSign,
} from '../src/integrations/tuya/signer.ts';

/**
 * التواقيع المتوقّعة أدناه هي نفسها في اختبارات Dart، وقد حُسبت خارجياً
 * بـ `openssl dgst -sha256 -hmac` — فالاختبار يقارن التنفيذ بمرجع مستقل،
 * ويُثبت في الوقت نفسه أن نقل P1.5 لم يغيّر بايتاً واحداً.
 */
const clientId = 'testclientid';
const secret = 'testsecret';
const timestampMs = 1_700_000_000_000;

describe('توقيع Tuya — اللبنات', () => {
  it('تجزئة الجسم الفارغ ثابتة ومطابقة لـ SHA-256("")', () => {
    expect(EMPTY_BODY_SHA256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('')).toBe(EMPTY_BODY_SHA256);
  });

  it('معاملات الاستعلام تُرتَّب أبجدياً', () => {
    expect(
      canonicalUrl('/v1.0/devices/x/logs', { size: '100', end_time: '2', start_time: '1' }),
    ).toBe('/v1.0/devices/x/logs?end_time=2&size=100&start_time=1');
  });

  it('مسار بلا معاملات يبقى كما هو', () => {
    expect(canonicalUrl('/v1.0/token')).toBe('/v1.0/token');
    expect(canonicalUrl('/v1.0/token', {})).toBe('/v1.0/token');
  });

  it('stringToSign يتبع بنية Tuya رباعية الأسطر', () => {
    expect(stringToSign({ method: 'get', path: '/v1.0/token', query: { grant_type: '1' } })).toBe(
      `GET\n${EMPTY_BODY_SHA256}\n\n/v1.0/token?grant_type=1`,
    );
  });
});

describe('توقيع Tuya — التوقيع', () => {
  it('طلب التوكن: بدون access_token في السلسلة', () => {
    expect(
      sign({
        clientId,
        secret,
        timestampMs,
        method: 'GET',
        path: '/v1.0/token',
        query: { grant_type: '1' },
      }),
    ).toBe('F40118B314E9CBBE12E6EE8A8E0D57CEC7B633B961992149FC4F21AF0A6FEEAD');
  });

  it('طلب أعمال بجسم: يشمل access_token وتجزئة الجسم', () => {
    const body = '{"commands":[{"code":"switch_1","value":true}]}';

    expect(sha256Hex(body)).toBe(
      '00c2368c059275b6f529e038fc079d641a933173858053bf72070d768d072f0e',
    );
    expect(
      sign({
        clientId,
        secret,
        timestampMs,
        method: 'POST',
        path: '/v1.0/devices/abc123/commands',
        body,
        accessToken: 'tok-xyz',
      }),
    ).toBe('40CDD4C5A7A5815698BBF348952FE9307752907FFEEC3FD17EC3635068A67F0F');
  });

  it('التوقيع بأحرف كبيرة دائماً وبطول 64', () => {
    const signature = sign({ clientId, secret, timestampMs, method: 'GET', path: '/v1.0/token' });
    expect(signature).toBe(signature.toUpperCase());
    expect(signature).toHaveLength(64);
  });

  it('تغيّر الطابع الزمني يغيّر التوقيع', () => {
    const at = (t: number) =>
      sign({ clientId, secret, timestampMs: t, method: 'GET', path: '/v1.0/token' });
    expect(at(timestampMs)).not.toBe(at(timestampMs + 1));
  });

  it('ترتيب إدخال المعاملات لا يؤثّر على التوقيع', () => {
    const withQuery = (query: Record<string, string>) =>
      sign({ clientId, secret, timestampMs, method: 'GET', path: '/v1.0/devices/x/logs', query });
    expect(withQuery({ a: '1', b: '2' })).toBe(withQuery({ b: '2', a: '1' }));
  });
});

describe('توقيع Tuya — الترويسات', () => {
  it('طلب التوكن لا يحمل ترويسة access_token ولا nonce', () => {
    const headers = signedHeaders({
      clientId,
      secret,
      timestampMs,
      method: 'GET',
      path: '/v1.0/token',
      query: { grant_type: '1' },
    });

    expect(headers['client_id']).toBe(clientId);
    expect(headers['sign_method']).toBe('HMAC-SHA256');
    expect(headers['t']).toBe(`${timestampMs}`);
    expect(headers).not.toHaveProperty('access_token');
    expect(headers).not.toHaveProperty('nonce');
  });

  it('طلب الأعمال يحمل access_token', () => {
    const headers = signedHeaders({
      clientId,
      secret,
      timestampMs,
      method: 'GET',
      path: '/v1.0/devices/abc/status',
      accessToken: 'tok-xyz',
    });
    expect(headers['access_token']).toBe('tok-xyz');
  });

  it('nonce غير الفارغ يُرسَل ويغيّر التوقيع', () => {
    const build = (nonce: string) =>
      signedHeaders({ clientId, secret, timestampMs, method: 'GET', path: '/v1.0/token', nonce });

    const without = build('');
    const withNonce = build('abc');

    expect(without).not.toHaveProperty('nonce');
    expect(withNonce['nonce']).toBe('abc');
    expect(without['sign']).not.toBe(withNonce['sign']);
  });
});
