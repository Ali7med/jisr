import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntegrationError } from '../src/integrations/errors.ts';
import { buildHarness, type TestHarness } from './support/app.ts';

let harness: TestHarness;
let auth: { authorization: string };

const DEVICE_ID = 'fake:d1';

async function createScene(steps = [{ deviceId: DEVICE_ID, key: 'switch_1', value: true }]) {
  return harness.app.inject({
    method: 'POST',
    url: '/scenes',
    headers: auth,
    payload: { name: 'سهرة', icon: '', steps },
  });
}

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

describe('المشاهد', () => {
  it('تُنشأ وتُشغَّل فتصل أوامرها للتكامل', async () => {
    const created = await createScene();
    expect(created.statusCode).toBe(201);

    const run = await harness.app.inject({
      method: 'POST',
      url: `/scenes/${(created.json() as { id: string }).id}/run`,
      headers: auth,
    });

    expect(run.json()).toMatchObject({ succeeded: 1, failed: 0 });
    expect(harness.fake.executed).toHaveLength(1);
  });

  it('خطوة تفشل لا تُلغي المشهد — والردّ يقول أيّها فشلت ولماذا', async () => {
    const created = await createScene([
      { deviceId: DEVICE_ID, key: 'switch_1', value: true },
      { deviceId: 'fake:غير-موجود', key: 'switch_1', value: true },
    ]);

    const run = await harness.app.inject({
      method: 'POST',
      url: `/scenes/${(created.json() as { id: string }).id}/run`,
      headers: auth,
    });

    const result = run.json() as {
      succeeded: number;
      failed: number;
      failures: { deviceId: string; message: string }[];
    };
    expect(result).toMatchObject({ succeeded: 1, failed: 1 });
    expect(result.failures[0]?.deviceId).toBe('fake:غير-موجود');
    expect(result.failures[0]?.message).toMatch(/لم نعثر/);
  });

  it('مشهد مستخدم آخر «غير موجود»', async () => {
    const created = await createScene();
    const other = await harness.authHeader('other@jisr.test');

    const run = await harness.app.inject({
      method: 'POST',
      url: `/scenes/${(created.json() as { id: string }).id}/run`,
      headers: other,
    });
    expect(run.statusCode).toBe(404);
  });
});

describe('الإشعارات', () => {
  it('أتمتة بإجراء إشعار تُخزّنه فيجده صاحبه لاحقاً', async () => {
    await harness.app.inject({
      method: 'POST',
      url: '/automations',
      headers: auth,
      payload: {
        name: 'تنبيه استهلاك',
        enabled: true,
        trigger: { kind: 'state', deviceId: DEVICE_ID, key: 'cur_power', op: 'gt', value: 100 },
        conditions: [],
        actions: [
          { kind: 'notify', title: 'استهلاك مرتفع', body: 'تجاوز الحدّ', severity: 'warning' },
        ],
      },
    });

    const me = await harness.app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    const userId = (me.json() as { id: string }).id;
    const [device] = await harness.repositories.devices.listVisible(userId);

    await harness.app.statePipeline.apply({
      userId,
      deviceId: device?.id ?? '',
      publicDeviceId: DEVICE_ID,
      values: [{ key: 'cur_power', value: 200 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const list = await harness.app.inject({
      method: 'GET',
      url: '/notifications',
      headers: auth,
    });
    expect(list.json()).toMatchObject({
      unread: 1,
      notifications: [{ title: 'استهلاك مرتفع', severity: 'warning', read: false }],
    });
  });

  it('تعليم الكل مقروءاً يُصفّر العدّاد', async () => {
    const me = await harness.app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    await harness.repositories.notifications.create({
      userId: (me.json() as { id: string }).id,
      title: 'تجربة',
      body: '',
      severity: 'info',
    });

    await harness.app.inject({ method: 'POST', url: '/notifications/read', headers: auth });
    const list = await harness.app.inject({ method: 'GET', url: '/notifications', headers: auth });

    expect((list.json() as { unread: number }).unread).toBe(0);
  });

  it('إشعار تكامل يفشل لا يمنع بقية الإجراءات', async () => {
    harness.fake.failWith = new IntegrationError('الجهاز غير متصل.', {
      integrationId: 'fake',
      kind: 'device',
    });

    const created = await createScene();
    const run = await harness.app.inject({
      method: 'POST',
      url: `/scenes/${(created.json() as { id: string }).id}/run`,
      headers: auth,
    });

    expect((run.json() as { failed: number }).failed).toBe(1);
    expect(run.statusCode).toBe(200);
  });
});
