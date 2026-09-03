import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildHarness, type TestHarness } from './support/app.ts';

let harness: TestHarness;
let auth: { authorization: string };
let url: string;

/**
 * عميل يخزّن ما يصل من لحظة الاتصال.
 *
 * ضروري لا تجميلي: مع مصادقة الترويسة تصل `hello` قبل أن يلتقط
 * الاختبار حدث `open`، فانتظار الرسالة بعد الاتصال يفوّتها.
 */
function client(headers?: Record<string, string>) {
  const socket = new WebSocket(url, headers ? { headers } : undefined);
  const messages: unknown[] = [];
  let closeCode: number | null = null;

  socket.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString('utf8'))));
  socket.on('close', (code: number) => {
    closeCode = code;
  });

  async function waitFor<T>(read: () => T | null | undefined, what: string): Promise<T> {
    const deadline = Date.now() + 4000;
    for (;;) {
      const value = read();
      if (value !== null && value !== undefined) return value;
      if (Date.now() > deadline) throw new Error(`انتهت المهلة بانتظار ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  return {
    socket,
    messages,
    send: (payload: unknown) => socket.send(JSON.stringify(payload)),
    message: (index: number) => waitFor(() => messages[index], `الرسالة رقم ${index}`),
    closed: () => waitFor(() => closeCode, 'إغلاق الاتصال'),
    close: () => socket.close(),
  };
}

beforeEach(async () => {
  harness = await buildHarness();
  auth = await harness.authHeader();
  await harness.app.listen({ port: 0, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${(harness.app.server.address() as AddressInfo).port}/ws`;
});

afterEach(async () => {
  await harness.app.close();
});

describe('القناة اللحظية', () => {
  it('ترويسة Authorization تكفي للمصادقة وتردّ hello', async () => {
    const ws = client(auth);
    expect(await ws.message(0)).toMatchObject({ type: 'hello' });
    ws.close();
  });

  it('رسالة auth تصادق العملاء الذين لا يملكون ترويسات (المتصفّح)', async () => {
    const ws = client();
    await new Promise((resolve) => ws.socket.once('open', resolve));
    ws.send({ type: 'auth', token: auth.authorization.slice('Bearer '.length) });

    expect(await ws.message(0)).toMatchObject({ type: 'hello' });
    ws.close();
  });

  it('توكن غير صالح يُغلق الاتصال برمز 4401', async () => {
    const ws = client({ authorization: 'Bearer not-a-valid-token' });
    expect(await ws.closed()).toBe(4401);
  });

  it('أول رسالة ليست auth تُغلق الاتصال برمز 4400', async () => {
    const ws = client();
    await new Promise((resolve) => ws.socket.once('open', resolve));
    ws.send({ type: 'ping' });

    expect(await ws.closed()).toBe(4400);
  });

  it('يصل حدث الحالة لصاحبه وحده', async () => {
    const mine = client(auth);
    await mine.message(0);

    const theirs = client(await harness.authHeader('other@jisr.test'));
    await theirs.message(0);

    const me = await harness.app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    const userId = (me.json() as { id: string }).id;

    harness.app.bus.publish(userId, {
      type: 'state',
      deviceId: 'fake:d1',
      values: [{ key: 'switch_1', value: true }],
      at: new Date().toISOString(),
    });

    expect(await mine.message(1)).toMatchObject({ type: 'state', deviceId: 'fake:d1' });
    expect(theirs.messages).toHaveLength(1);

    mine.close();
    theirs.close();
  });

  it('إغلاق الاتصال يلغي الاشتراك فلا تتسرّب المستمعات', async () => {
    const ws = client(auth);
    await ws.message(0);
    expect(harness.app.bus.subscriberCount()).toBe(1);

    ws.close();
    await ws.closed();
    // الخادم يعالج الإغلاق بعد العميل بقليل
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(harness.app.bus.subscriberCount()).toBe(0);
  });
});
