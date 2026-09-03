import { createHash, createHmac } from 'node:crypto';

/**
 * توقيع طلبات Tuya Cloud OpenAPI — HMAC-SHA256.
 *
 * منقول حرفياً من نسخة Dart المُثبَتة باختباراتها (P1.5)، والاختبارات
 * نُقلت معه لتُثبت تطابق المخرجات بايتاً ببايت.
 *
 * الخوارزمية (حسب توثيق Tuya):
 * ```
 * stringToSign = METHOD \n SHA256(body) \n signHeaders \n url
 * str          = clientId + [accessToken] + t + nonce + stringToSign
 * sign         = HMAC-SHA256(str, secret).toUpperCase()
 * ```
 * `accessToken` يُحذف من `str` في طلبات الحصول على التوكن نفسه.
 */

/** SHA-256 لجسم فارغ — ثابت متكرر، نحسبه مرة واحدة. */
export const EMPTY_BODY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** المسار مع معاملات الاستعلام مرتّبة أبجدياً — الترتيب جزء من التوقيع. */
export function canonicalUrl(path: string, query?: Readonly<Record<string, string>>): string {
  if (!query) return path;
  const keys = Object.keys(query).sort();
  if (keys.length === 0) return path;
  return `${path}?${keys.map((key) => `${key}=${query[key]}`).join('&')}`;
}

export interface SignInput {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: string | undefined;
}

export function stringToSign(input: SignInput): string {
  const contentHash = input.body ? sha256Hex(input.body) : EMPTY_BODY_SHA256;
  // السطر الثالث (signHeaders) فارغ لأننا لا نستخدم ترويسة Signature-Headers.
  return `${input.method.toUpperCase()}\n${contentHash}\n\n${canonicalUrl(input.path, input.query)}`;
}

export interface SignatureInput extends SignInput {
  readonly clientId: string;
  readonly secret: string;
  readonly timestampMs: number;
  readonly accessToken?: string | undefined;
  readonly nonce?: string;
}

export function sign(input: SignatureInput): string {
  const payload =
    `${input.clientId}${input.accessToken ?? ''}${input.timestampMs}${input.nonce ?? ''}` +
    stringToSign(input);

  return createHmac('sha256', Buffer.from(input.secret, 'utf8'))
    .update(payload, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/** الترويسات الكاملة لطلب موقّع، جاهزة للإرسال. */
export function signedHeaders(input: SignatureInput): Record<string, string> {
  const headers: Record<string, string> = {
    client_id: input.clientId,
    sign: sign(input),
    t: `${input.timestampMs}`,
    sign_method: 'HMAC-SHA256',
    'Content-Type': 'application/json',
  };
  if (input.nonce) headers['nonce'] = input.nonce;
  if (input.accessToken) headers['access_token'] = input.accessToken;
  return headers;
}
