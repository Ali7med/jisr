import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntegrationError } from '../src/integrations/errors.ts';
import { buildHarness, type TestHarness } from './support/app.ts';

let harness: TestHarness;
let auth: { authorization: string };

const DEVICE_ID = 'fake:d1';

beforeEach(async () => {
  harness = await buildHarness();
  auth = await harness.authHeader();
  await harness.app.inject({
    method: 'POST',
    url: '/accounts',
    headers: auth,
    payload: { integrationId: 'fake', label: 'بيتي', credentials: { token: 'سرّ' } },
  });
});

afterEach(async () => {
  await harness.app.close();
});

describe('GET /devices', () => {
  it('يعيد أجهزة كل الحسابات بمعرّف مركّب لا يكشف معرّفنا الداخلي', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/devices', headers: auth });

    expect(response.statusCode).toBe(200);
    const { devices } = response.json() as { devices: { id: string; name: string }[] };
    expect(devices).toHaveLength(1);
    expect(devices[0]?.id).toBe(DEVICE_ID);
    expect(devices[0]?.name).toBe('مصباح');
  });

  it('لا يستهلك حصّة الشركة — يُقرأ من قاعدتنا', async () => {
    const before = harness.fake.stateCalls;
    await harness.app.inject({ method: 'GET', url: '/devices', headers: auth });
    expect(harness.fake.stateCalls).toBe(before);
  });

  it('مستخدم آخر لا يرى شيئاً', async () => {
    const other = await harness.authHeader('other@jisr.test');
    const response = await harness.app.inject({ method: 'GET', url: '/devices', headers: other });
    expect((response.json() as { devices: unknown[] }).devices).toHaveLength(0);
  });
});

describe('GET /devices/:id', () => {
  it('يعيد الجهاز وقدراته وقيمه الحالية', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: `/devices/${DEVICE_ID}`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      device: { id: DEVICE_ID, capabilities: [{ key: 'switch_1', kind: 'toggle' }] },
      values: [{ key: 'switch_1', value: true }],
    });
  });

  it('القدرات تُجلب مرة واحدة وتُخزَّن، والحالة تُجلب حيّة كل مرة', async () => {
    await harness.app.inject({ method: 'GET', url: `/devices/${DEVICE_ID}`, headers: auth });
    await harness.app.inject({ method: 'GET', url: `/devices/${DEVICE_ID}`, headers: auth });

    expect(harness.fake.capabilityCalls).toBe(1);
    expect(harness.fake.stateCalls).toBe(2);
  });

  it('جهاز غير موجود يعطي 404 برسالة تقترح المزامنة', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/devices/fake:لا-يوجد',
      headers: auth,
    });

    expect(response.statusCode).toBe(404);
    expect((response.json() as { message: string }).message).toMatch(/زامِن/);
  });

  it('جهاز مستخدم آخر «غير موجود»', async () => {
    const other = await harness.authHeader('other@jisr.test');
    const response = await harness.app.inject({
      method: 'GET',
      url: `/devices/${DEVICE_ID}`,
      headers: other,
    });
    expect(response.statusCode).toBe(404);
  });

  it('يُغلق موارد التكامل بعد كل استدعاء', async () => {
    const before = harness.fake.disposed;
    await harness.app.inject({ method: 'GET', url: `/devices/${DEVICE_ID}`, headers: auth });
    expect(harness.fake.disposed).toBe(before + 1);
  });
});

describe('POST /devices/:id/commands', () => {
  it('يمرّر الأمر للتكامل ويعيد قبولاً بطابع زمني', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: auth,
      payload: { commands: [{ key: 'switch_1', value: false }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deviceId: DEVICE_ID, accepted: true });
    expect(harness.fake.executed).toEqual([
      { nativeId: 'd1', commands: [{ key: 'switch_1', value: false }] },
    ]);
  });

  it('قائمة أوامر فارغة تُرفض بالتحقّق لا بصمت', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: auth,
      payload: { commands: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('رفض الشركة للأمر يصير 409 برسالتها العربية', async () => {
    harness.fake.failWith = new IntegrationError('الجهاز غير متصل بالإنترنت حالياً.', {
      integrationId: 'fake',
      kind: 'device',
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: auth,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'INTEGRATION_DEVICE',
      message: 'الجهاز غير متصل بالإنترنت حالياً.',
    });
  });

  it('تجاوز حصّة الشركة يصير 429 ولا يتسرّب منه تفصيل داخلي', async () => {
    harness.fake.failWith = new IntegrationError('تجاوزت حصة الاستدعاءات لهذا الشهر.', {
      integrationId: 'fake',
      kind: 'quota',
      rawMessage: 'quota exceeded: project 12345',
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: auth,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });

    expect(response.statusCode).toBe(429);
    expect(response.body).not.toContain('12345');
  });
});

describe('GET /devices/:id/history', () => {
  it('يقرأ من قاعدتنا حين تحوي قراءات ولا يستدعي الشركة', async () => {
    const me = await harness.app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    const userId = (me.json() as { id: string }).id;
    const [device] = await harness.repositories.devices.listVisible(userId);
    harness.repositories.seedHistory(device?.id ?? '', [
      { key: 'cur_power', value: 7, recordedAt: new Date('2026-09-02T09:00:00.000Z') },
    ]);

    const response = await harness.app.inject({
      method: 'GET',
      url: `/devices/${DEVICE_ID}/history?start=2026-09-01T00:00:00.000Z&end=2026-09-03T00:00:00.000Z`,
      headers: auth,
    });

    expect(response.json()).toMatchObject({
      source: 'server',
      points: [{ key: 'cur_power', value: 7 }],
    });
    expect(harness.fake.historyCalls).toBe(0);
  });

  it('سجلّنا فارغ ⇒ يسدّ الفجوة من الشركة ويصرّح بالمصدر', async () => {
    harness.fake.historyPoints = [
      { key: 'cur_power', value: 12, at: new Date('2026-09-01T10:00:00.000Z').toISOString() },
    ];

    const response = await harness.app.inject({
      method: 'GET',
      url: `/devices/${DEVICE_ID}/history?keys=cur_power&limit=10`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      deviceId: DEVICE_ID,
      source: 'integration',
      points: [{ key: 'cur_power', value: 12 }],
    });
  });

  it('حدّ أعلى غير صالح يُرفض بالتحقّق', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: `/devices/${DEVICE_ID}/history?limit=99999`,
      headers: auth,
    });

    expect(response.statusCode).toBe(400);
  });
});
