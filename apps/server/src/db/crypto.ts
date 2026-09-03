import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * تشفير أسرار التكاملات — AES-256-GCM بمفتاح **خارج القاعدة** (الهيكلية § 7).
 *
 * حدّ معروف وموثّق: المفتاح يعيش على نفس المضيف، فاختراق الخادم يكشف
 * المفتاح والبيانات معاً. `keyVersion` يسمح بالتدوير التدريجي وبالترقية
 * لاحقاً إلى KMS/Vault بلا تغيير شكل البيانات المخزّنة.
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // موصى به لـ GCM

export interface SealedSecrets {
  readonly cipher: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly keyVersion: number;
}

export interface SecretsCipher {
  readonly keyVersion: number;
  seal(secrets: Record<string, string>): SealedSecrets;
  open(sealed: Omit<SealedSecrets, 'keyVersion'> & { keyVersion: number }): Record<string, string>;
}

/** يقرأ مفتاحاً بصيغة base64 ويتحقّق من طوله قبل أي استخدام. */
export function parseKey(raw: string, label: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(`${label} ليس base64 صالحاً`);
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${label} يجب أن يكون ${KEY_BYTES} بايت بصيغة base64 (الطول الحالي ${key.length}) — ` +
        `ولّده بـ: openssl rand -base64 32`,
    );
  }
  return key;
}

/**
 * ينشئ مُشفّراً. `keys` تربط رقم النسخة بالمفتاح: الكتابة تستخدم
 * `activeVersion`، والقراءة تقبل أي نسخة معروفة — وهذا ما يجعل التدوير
 * ممكناً بلا توقّف.
 */
export function createSecretsCipher(
  keys: ReadonlyMap<number, Buffer>,
  activeVersion: number,
): SecretsCipher {
  const activeKey = keys.get(activeVersion);
  if (!activeKey) {
    throw new Error(`لا يوجد مفتاح تشفير للنسخة النشطة ${activeVersion}`);
  }

  return {
    keyVersion: activeVersion,

    seal(secrets) {
      const iv = randomBytes(IV_BYTES);
      const encryptor = createCipheriv(ALGORITHM, activeKey, iv);
      const cipher = Buffer.concat([
        encryptor.update(JSON.stringify(secrets), 'utf8'),
        encryptor.final(),
      ]);
      return { cipher, iv, tag: encryptor.getAuthTag(), keyVersion: activeVersion };
    },

    open(sealed) {
      const key = keys.get(sealed.keyVersion);
      if (!key) {
        throw new Error(
          `تعذّر فكّ التشفير: لا يوجد مفتاح للنسخة ${sealed.keyVersion} — ` +
            'تحقّق من متغيّرات البيئة قبل تشغيل السيرفر',
        );
      }
      const decryptor = createDecipheriv(ALGORITHM, key, sealed.iv);
      decryptor.setAuthTag(sealed.tag);
      const plain = Buffer.concat([decryptor.update(sealed.cipher), decryptor.final()]);
      return JSON.parse(plain.toString('utf8')) as Record<string, string>;
    },
  };
}

/** مقارنة ثابتة الزمن لسلاسل بطول متساوٍ (مجزّآت الرموز). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
