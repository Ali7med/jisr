import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

describe('GET /health', () => {
  it('يردّ ok مع الإصدار وزمن التشغيل', async () => {
    const app = await buildApp(loadConfig({ APP_VERSION: '1.2.3', LOG_LEVEL: 'silent' }));
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
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT غير صالح/);
  });
});

describe('الأخطاء', () => {
  it('مسار غير موجود يردّ عقد ApiError برسالة عربية', async () => {
    const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
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
