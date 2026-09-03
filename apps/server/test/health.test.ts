import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { buildTestApp, TEST_ENV } from './support/app.ts';

describe('GET /health', () => {
  it('يردّ ok مع الإصدار وزمن التشغيل', async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'ok',
        version: '1.2.3',
        uptimeSeconds: expect.any(Number),
      });
    } finally {
      await app.close();
    }
  });
});

describe('loadConfig', () => {
  it('يرفض منفذاً غير صالح برسالة عربية', () => {
    expect(() => loadConfig({ ...TEST_ENV, PORT: 'abc' })).toThrow(/PORT غير صالح/);
  });

  it('يرفض الإقلاع بلا DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...env } = TEST_ENV;
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL مفقود/);
  });

  it('يرفض سرّ JWT قصيراً', () => {
    expect(() => loadConfig({ ...TEST_ENV, JWT_SECRET: 'قصير' })).toThrow(/JWT_SECRET قصير/);
  });

  it('يرفض مفتاح تشفير بطول خاطئ', () => {
    expect(() => loadConfig({ ...TEST_ENV, SECRETS_KEY_V1: 'YWJj' })).toThrow(/32 بايت/);
  });
});

describe('الأخطاء', () => {
  it('مسار غير موجود يردّ عقد ApiError برسالة عربية', async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/لا-يوجد' });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.code).toBe('NOT_FOUND');
      expect(body.message).toMatch(/[؀-ۿ]/);
      expect(body).not.toHaveProperty('error');
    } finally {
      await app.close();
    }
  });
});
