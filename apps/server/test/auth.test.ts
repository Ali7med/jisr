import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app.ts';

const CREDENTIALS = {
  email: 'Ali@Example.com',
  password: 'كلمة-مرور-طويلة-كفاية',
  displayName: 'علي',
};

describe('POST /auth/register', () => {
  it('ينشئ حساباً ويعيد جلسة كاملة', async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: CREDENTIALS,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user).toMatchObject({ email: 'ali@example.com', displayName: 'علي' });
      expect(body.tokens).toMatchObject({ tokenType: 'Bearer', expiresInSeconds: 900 });
      expect(body.user).not.toHaveProperty('passwordHash');
    } finally {
      await app.close();
    }
  });

  it('يرفض بريداً مكرّراً — ولو باختلاف حالة الأحرف', async () => {
    const app = await buildTestApp();
    try {
      await app.inject({ method: 'POST', url: '/auth/register', payload: CREDENTIALS });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...CREDENTIALS, email: 'ALI@example.com' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('EMAIL_TAKEN');
    } finally {
      await app.close();
    }
  });

  it('يرفض كلمة مرور قصيرة قبل لمس القاعدة', async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...CREDENTIALS, password: 'قصيرة' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_FAILED');
    } finally {
      await app.close();
    }
  });
});

describe('POST /auth/login', () => {
  it('ينجح بالبيانات الصحيحة ولو اختلفت حالة أحرف البريد', async () => {
    const app = await buildTestApp();
    try {
      await app.inject({ method: 'POST', url: '/auth/register', payload: CREDENTIALS });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ali@EXAMPLE.com', password: CREDENTIALS.password },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().tokens.accessToken).toBeTypeOf('string');
    } finally {
      await app.close();
    }
  });

  it('يعطي نفس الرسالة لبريد مجهول ولكلمة مرور خاطئة', async () => {
    const app = await buildTestApp();
    try {
      await app.inject({ method: 'POST', url: '/auth/register', payload: CREDENTIALS });

      const unknownEmail = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nobody@example.com', password: CREDENTIALS.password },
      });
      const wrongPassword = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: CREDENTIALS.email, password: 'كلمة-مرور-خاطئة-تماماً' },
      });

      expect(unknownEmail.statusCode).toBe(401);
      expect(wrongPassword.statusCode).toBe(401);
      // لا يُستدلّ على وجود البريد من اختلاف الردّ
      expect(unknownEmail.json()).toEqual(wrongPassword.json());
    } finally {
      await app.close();
    }
  });
});

describe('POST /auth/refresh', () => {
  it('يدوّر الرمز: الجديد يعمل والقديم يُبطَل فوراً', async () => {
    const app = await buildTestApp();
    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: CREDENTIALS,
      });
      const first = registered.json().tokens.refreshToken;

      const refreshed = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: first },
      });
      expect(refreshed.statusCode).toBe(200);
      const second = refreshed.json().refreshToken;
      expect(second).not.toBe(first);

      const reuseOld = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: first },
      });
      expect(reuseOld.statusCode).toBe(401);
      expect(reuseOld.json().code).toBe('INVALID_REFRESH_TOKEN');

      const useNew = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: second },
      });
      expect(useNew.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('POST /auth/logout', () => {
  it('يُبطل رمز التجديد', async () => {
    const app = await buildTestApp();
    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: CREDENTIALS,
      });
      const refreshToken = registered.json().tokens.refreshToken;

      const loggedOut = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken },
      });
      expect(loggedOut.statusCode).toBe(204);

      const afterLogout = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      expect(afterLogout.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('GET /auth/me', () => {
  it('يعيد الملف الشخصي بتوكن صالح', async () => {
    const app = await buildTestApp();
    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: CREDENTIALS,
      });
      const { accessToken } = registered.json().tokens;

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().email).toBe('ali@example.com');
    } finally {
      await app.close();
    }
  });

  it('يرفض بلا توكن برسالة عربية على عقد ApiError', async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/auth/me' });

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('UNAUTHORIZED');
      expect(response.json().message).toMatch(/[؀-ۿ]/);
    } finally {
      await app.close();
    }
  });

  it('يرفض توكناً مزوّراً', async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: 'Bearer not.a.real.token' },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('حدّ الطلبات', () => {
  it('سقف /auth أشدّ من الحدّ العام', async () => {
    const app = await buildTestApp();
    try {
      const auth = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'a@b.com', password: 'x' },
      });
      const general = await app.inject({ method: 'GET', url: '/health' });

      expect(String(auth.headers['x-ratelimit-limit'])).toBe('10');
      expect(String(general.headers['x-ratelimit-limit'])).toBe('300');
    } finally {
      await app.close();
    }
  });
});
