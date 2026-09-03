import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretsCipher, parseKey, safeEqual } from '../src/db/crypto.ts';

const key = (): Buffer => randomBytes(32);

describe('تشفير الأسرار AES-GCM', () => {
  it('يفكّ ما شفّره', () => {
    const cipher = createSecretsCipher(new Map([[1, key()]]), 1);
    const secrets = { clientId: 'abc', clientSecret: 'سرّ', dataCenter: 'eu' };

    expect(cipher.open(cipher.seal(secrets))).toEqual(secrets);
  });

  it('ينتج نصّاً مشفّراً مختلفاً لنفس المدخل (IV عشوائي)', () => {
    const cipher = createSecretsCipher(new Map([[1, key()]]), 1);
    const a = cipher.seal({ x: '1' });
    const b = cipher.seal({ x: '1' });

    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.cipher.equals(b.cipher)).toBe(false);
  });

  it('يرفض نصّاً مشفّراً مُعبَثاً به (وسم المصادقة)', () => {
    const cipher = createSecretsCipher(new Map([[1, key()]]), 1);
    const sealed = cipher.seal({ x: 'سرّ' });
    const tampered = Buffer.from(sealed.cipher);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;

    expect(() => cipher.open({ ...sealed, cipher: tampered })).toThrow();
  });

  it('يقرأ بمفتاح نسخة قديمة ويكتب بالنشطة (تدوير بلا توقّف)', () => {
    const v1 = key();
    const v2 = key();
    const oldCipher = createSecretsCipher(new Map([[1, v1]]), 1);
    const sealedOld = oldCipher.seal({ x: 'قديم' });

    const rotated = createSecretsCipher(
      new Map([
        [1, v1],
        [2, v2],
      ]),
      2,
    );

    expect(rotated.open(sealedOld)).toEqual({ x: 'قديم' });
    expect(rotated.seal({ x: 'جديد' }).keyVersion).toBe(2);
  });

  it('يرفض فكّ التشفير بنسخة مفتاح مجهولة برسالة عربية', () => {
    const cipher = createSecretsCipher(new Map([[1, key()]]), 1);
    const sealed = cipher.seal({ x: '1' });

    expect(() => cipher.open({ ...sealed, keyVersion: 9 })).toThrow(/لا يوجد مفتاح للنسخة 9/);
  });
});

describe('parseKey', () => {
  it('يرفض مفتاحاً بطول خاطئ ويقترح أمر التوليد', () => {
    expect(() => parseKey('YWJj', 'SECRETS_KEY_V1')).toThrow(/openssl rand -base64 32/);
  });
});

describe('safeEqual', () => {
  it('يقارن بنجاح ويفشل عند الاختلاف أو اختلاف الطول', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
