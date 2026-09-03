import { parseKey } from './db/crypto.ts';

/** إعدادات التشغيل — تُقرأ من البيئة مرة واحدة عند الإقلاع. */
export interface Config {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly version: string;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  /** مفاتيح تشفير الأسرار مرقّمة بنسخها — تسمح بالتدوير بلا توقّف. */
  readonly secretsKeys: ReadonlyMap<number, Buffer>;
  readonly secretsKeyVersion: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`متغيّر البيئة ${key} مفقود — راجع apps/server/.env.example`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT غير صالح: ${env['PORT']} — يجب أن يكون رقم منفذ بين 1 و65535`);
  }
  const jwtSecret = required(env, 'JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET قصير جداً — استخدم 32 محرفاً على الأقل: openssl rand -base64 32');
  }

  const activeVersion = Number(env['SECRETS_KEY_VERSION'] ?? 1);
  if (!Number.isInteger(activeVersion) || activeVersion < 1) {
    throw new Error(`SECRETS_KEY_VERSION غير صالح: ${env['SECRETS_KEY_VERSION']}`);
  }

  // SECRETS_KEY_V1 … SECRETS_KEY_Vn — القراءة تقبل كل نسخة موجودة
  const secretsKeys = new Map<number, Buffer>();
  for (const [key, value] of Object.entries(env)) {
    const match = /^SECRETS_KEY_V(\d+)$/.exec(key);
    if (match?.[1] && value) {
      secretsKeys.set(Number(match[1]), parseKey(value, key));
    }
  }
  if (!secretsKeys.has(activeVersion)) {
    throw new Error(
      `مفتاح التشفير SECRETS_KEY_V${activeVersion} مفقود — ولّده بـ: openssl rand -base64 32`,
    );
  }

  return {
    port,
    host: env['HOST'] ?? '0.0.0.0',
    logLevel: env['LOG_LEVEL'] ?? 'info',
    version: env['APP_VERSION'] ?? '0.0.0',
    databaseUrl: required(env, 'DATABASE_URL'),
    jwtSecret,
    accessTokenTtlSeconds: Number(env['ACCESS_TOKEN_TTL_SECONDS'] ?? 900),
    refreshTokenTtlDays: Number(env['REFRESH_TOKEN_TTL_DAYS'] ?? 30),
    secretsKeys,
    secretsKeyVersion: activeVersion,
  };
}
