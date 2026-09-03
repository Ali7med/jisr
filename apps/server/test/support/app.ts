import { randomBytes } from 'node:crypto';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import { createMemoryRepositories, type MemoryRepositories } from './memory-repositories.ts';
import { createIntegrationRegistry } from '../../src/integrations/registry.ts';
import { createFakeIntegration, type FakeState } from './fake-integration.ts';
import type { FastifyInstance } from 'fastify';

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

export interface TestHarness {
  readonly app: FastifyInstance;
  readonly repositories: MemoryRepositories;
  readonly fake: FakeState;
  /** يسجّل مستخدماً ويعيد ترويسة المصادقة جاهزة. */
  authHeader(email?: string): Promise<{ authorization: string }>;
}

/** تطبيق كامل بتكامل وهمي — يختبر المسارات بلا شبكة ولا قاعدة بيانات. */
export async function buildHarness(): Promise<TestHarness> {
  const repositories = createMemoryRepositories();
  const { entry, state } = createFakeIntegration();
  const app = await buildApp(loadConfig(TEST_ENV), {
    repositories,
    registry: createIntegrationRegistry([entry]),
  });

  return {
    app,
    repositories,
    fake: state,
    async authHeader(email = 'user@jisr.test') {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'كلمة-مرور-قوية-جداً', displayName: 'علي' },
      });
      const session = response.json() as { tokens: { accessToken: string } };
      return { authorization: `Bearer ${session.tokens.accessToken}` };
    },
  };
}
