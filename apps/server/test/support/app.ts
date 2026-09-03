import { randomBytes } from 'node:crypto';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import { createMemoryRepositories } from './memory-repositories.ts';

/** بيئة اختبار كاملة الإعدادات — لا تلمس قاعدة بيانات ولا شبكة. */
export const TEST_ENV: NodeJS.ProcessEnv = {
  LOG_LEVEL: 'silent',
  APP_VERSION: '1.2.3',
  DATABASE_URL: 'postgresql://test/test',
  JWT_SECRET: randomBytes(32).toString('base64'),
  SECRETS_KEY_V1: randomBytes(32).toString('base64'),
};

export async function buildTestApp(overrides: NodeJS.ProcessEnv = {}) {
  return buildApp(loadConfig({ ...TEST_ENV, ...overrides }), {
    repositories: createMemoryRepositories(),
  });
}
