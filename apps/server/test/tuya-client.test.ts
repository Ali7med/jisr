import { describe, expect, it, vi } from 'vitest';
import { IntegrationError } from '../src/integrations/errors.ts';
import { createTuyaClient } from '../src/integrations/tuya/client.ts';
import { dataCenterFromHost } from '../src/integrations/tuya/config.ts';

const dataCenter = dataCenterFromHost('openapi.tuyaeu.com');

const TOKEN_RESULT = {
  success: true,
  result: { access_token: 'tok-1', refresh_token: 'ref-1', uid: 'u1', expire_time: 7200 },
};

/** يردّ استجابة لكل طلب بالترتيب، ويسجّل الروابط والترويسات. */
function fakeFetch(bodies: unknown[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: `${input}`, headers: (init?.headers ?? {}) as Record<string, string> });
    const body = bodies.shift() ?? { success: false, code: 9999, msg: 'no more responses' };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function client(bodies: unknown[]) {
  const { impl, calls } = fakeFetch(bodies);
  return {
    calls,
    tuya: createTuyaClient({ accessId: 'id', accessSecret: 'secret', dataCenter, fetchImpl: impl }),
  };
}

function throwingClient(impl: typeof fetch) {
  return createTuyaClient({ accessId: 'id', accessSecret: 'secret', dataCenter, fetchImpl: impl });
}

describe('عميل Tuya', () => {
  it('يجلب التوكن ثم يوقّع طلب الأعمال به', async () => {
    const { tuya, calls } = client([TOKEN_RESULT, { success: true, result: [{ id: 'd1' }] }]);

    const result = await tuya.get('/v1.0/users/u1/devices');

    expect(result).toEqual([{ id: 'd1' }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain('/v1.0/token?grant_type=1');
    expect(calls[0]?.headers['access_token']).toBeUndefined();
    expect(calls[1]?.headers['access_token']).toBe('tok-1');
    expect(calls[1]?.headers['sign']).toMatch(/^[0-9A-F]{64}$/);
  });

  it('طلبات متوازية تجلب التوكن مرة واحدة', async () => {
    const { tuya, calls } = client([
      TOKEN_RESULT,
      { success: true, result: 1 },
      { success: true, result: 2 },
      { success: true, result: 3 },
    ]);

    await Promise.all([tuya.get('/a'), tuya.get('/b'), tuya.get('/c')]);

    expect(calls.filter((call) => call.url.includes('/v1.0/token'))).toHaveLength(1);
  });

  it('يترجم كود Tuya إلى رسالة عربية وتصنيف', async () => {
    const { tuya } = client([TOKEN_RESULT, { success: false, code: 1106, msg: 'permission deny' }]);

    await expect(tuya.get('/x')).rejects.toMatchObject({
      kind: 'permission',
      code: 1106,
      rawMessage: 'permission deny',
      integrationId: 'tuya',
      message: expect.stringContaining('صلاحية مرفوضة'),
    });
  });

  it('كود مجهول يُظهر نصّ Tuya الأصلي بدل ابتلاعه', async () => {
    const { tuya } = client([TOKEN_RESULT, { success: false, code: 4242, msg: 'weird failure' }]);
    await expect(tuya.get('/x')).rejects.toThrow(/weird failure/);
  });

  it('توكن منتهٍ: يجدّد ويعيد المحاولة مرة واحدة فقط', async () => {
    const { tuya, calls } = client([
      TOKEN_RESULT,
      { success: false, code: 1010, msg: 'token invalid' },
      { ...TOKEN_RESULT, result: { ...TOKEN_RESULT.result, access_token: 'tok-2' } },
      { success: true, result: 'ok' },
    ]);

    expect(await tuya.get('/x')).toBe('ok');
    expect(calls.filter((call) => call.url.includes('/v1.0/token'))).toHaveLength(2);
    expect(calls.at(-1)?.headers['access_token']).toBe('tok-2');
  });

  it('فشل متكرّر بعد التجديد يرمي بدل حلقة لا تنتهي', async () => {
    const { tuya, calls } = client([
      TOKEN_RESULT,
      { success: false, code: 1010, msg: 'token invalid' },
      TOKEN_RESULT,
      { success: false, code: 1010, msg: 'token invalid' },
    ]);

    await expect(tuya.get('/x')).rejects.toBeInstanceOf(IntegrationError);
    expect(calls).toHaveLength(4);
  });

  it('انقطاع الشبكة يصير رسالة عربية من تصنيف network', async () => {
    const tuya = throwingClient(
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    );

    await expect(tuya.get('/x')).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('تعذّر الاتصال'),
    });
  });

  it('استجابة ليست JSON تُقال صريحة', async () => {
    const tuya = throwingClient(
      vi.fn(async () => new Response('not json at all')) as unknown as typeof fetch,
    );

    await expect(tuya.get('/x')).rejects.toThrow(/استجابة غير مفهومة/);
  });

  it('POST يرسل جسماً موقّعاً', async () => {
    const { tuya, calls } = client([TOKEN_RESULT, { success: true, result: true }]);

    await tuya.post('/v1.0/devices/d1/commands', { commands: [{ code: 'switch_1', value: true }] });

    expect(calls[1]?.url).toContain('/v1.0/devices/d1/commands');
    expect(calls[1]?.headers['sign']).toMatch(/^[0-9A-F]{64}$/);
  });
});
