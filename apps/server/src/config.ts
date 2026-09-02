/** إعدادات التشغيل — تُقرأ من البيئة مرة واحدة عند الإقلاع. */
export interface Config {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT غير صالح: ${env['PORT']} — يجب أن يكون رقم منفذ بين 1 و65535`);
  }
  return {
    port,
    host: env['HOST'] ?? '0.0.0.0',
    logLevel: env['LOG_LEVEL'] ?? 'info',
    version: env['APP_VERSION'] ?? '0.0.0',
  };
}
