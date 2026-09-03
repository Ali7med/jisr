import { describe, expect, it } from 'vitest';
import {
  compare,
  conditionsMet,
  localTime,
  scheduleDue,
  stateTriggerMatches,
  withinWindow,
} from '../src/automation/evaluate.ts';
import { buildHarness } from './support/app.ts';

/** المنطق الخالص: هنا تُختبر الحالات التي يخطئ فيها كل محرّك أتمتة. */
describe('موازنة القيم', () => {
  it('changed تعني «لأي قيمة»', () => {
    expect(compare('changed', 5, undefined)).toBe(true);
    expect(compare('changed', false, 99)).toBe(true);
  });

  it('المساواة تعمل على القيم المركّبة بمحتواها', () => {
    expect(compare('eq', { h: 1 }, { h: 1 })).toBe(true);
    expect(compare('ne', { h: 1 }, { h: 2 })).toBe(true);
  });

  it('الموازنة العددية على غير عدد تقول «لا» بدل التخمين', () => {
    expect(compare('gt', 'كثير', 10)).toBe(false);
    expect(compare('lt', true, 1)).toBe(false);
    expect(compare('gte', 10, 10)).toBe(true);
  });
});

describe('مُشغِّل الحالة', () => {
  const trigger = {
    kind: 'state' as const,
    deviceId: 'tuya:d1',
    key: 'cur_power',
    op: 'gt' as const,
    value: 100,
  };

  it('يُشغَّل بالجهاز والمفتاح الصحيحين فقط', () => {
    expect(stateTriggerMatches(trigger, { deviceId: 'tuya:d1', key: 'cur_power', value: 150 })).toBe(true);
    expect(stateTriggerMatches(trigger, { deviceId: 'tuya:d2', key: 'cur_power', value: 150 })).toBe(false);
    expect(stateTriggerMatches(trigger, { deviceId: 'tuya:d1', key: 'switch_1', value: 150 })).toBe(false);
    expect(stateTriggerMatches(trigger, { deviceId: 'tuya:d1', key: 'cur_power', value: 50 })).toBe(false);
  });
});

describe('الوقت المحلي', () => {
  it('يُحسب بمنطقة المستخدم لا بمنطقة الخادم', () => {
    const noon = new Date('2026-09-03T12:00:00.000Z');

    expect(localTime(noon, 'UTC').minutes).toBe(720);
    // بغداد UTC+3
    expect(localTime(noon, 'Asia/Baghdad').minutes).toBe(900);
  });

  it('منطقة غير صالحة تعود إلى UTC بدل أن ترمي', () => {
    const noon = new Date('2026-09-03T12:00:00.000Z');
    expect(localTime(noon, 'منطقة/غير-موجودة').minutes).toBe(720);
  });

  it('نافذة تعبر منتصف الليل صالحة', () => {
    const from = 22 * 60;
    const to = 6 * 60;

    expect(withinWindow(23 * 60, from, to)).toBe(true);
    expect(withinWindow(2 * 60, from, to)).toBe(true);
    expect(withinWindow(12 * 60, from, to)).toBe(false);
  });
});

describe('مُشغِّل الوقت', () => {
  const trigger = {
    kind: 'schedule' as const,
    at: '07:00',
    days: [] as number[],
    timezone: 'UTC',
  };

  it('يستحقّ عند موعده وبعده بمهلة السماح', () => {
    expect(scheduleDue(trigger, new Date('2026-09-03T07:00:00Z'), null)).toBe(true);
    expect(scheduleDue(trigger, new Date('2026-09-03T07:04:00Z'), null)).toBe(true);
  });

  it('لا يستحقّ قبل موعده ولا بعد فوات المهلة', () => {
    expect(scheduleDue(trigger, new Date('2026-09-03T06:59:00Z'), null)).toBe(false);
    expect(scheduleDue(trigger, new Date('2026-09-03T07:30:00Z'), null)).toBe(false);
  });

  it('لا يتكرّر في اليوم نفسه — وهذا ما يحفظه lastRunAt في القاعدة', () => {
    const ran = new Date('2026-09-03T07:00:30Z');
    expect(scheduleDue(trigger, new Date('2026-09-03T07:02:00Z'), ran)).toBe(false);
    // اليوم التالي يستحقّ من جديد
    expect(scheduleDue(trigger, new Date('2026-09-04T07:01:00Z'), ran)).toBe(true);
  });

  it('يحترم أيام الأسبوع المختارة', () => {
    // 2026-09-03 خميس (day 4)
    const thursdayOnly = { ...trigger, days: [4] };
    const fridayOnly = { ...trigger, days: [5] };

    expect(scheduleDue(thursdayOnly, new Date('2026-09-03T07:00:00Z'), null)).toBe(true);
    expect(scheduleDue(fridayOnly, new Date('2026-09-03T07:00:00Z'), null)).toBe(false);
  });
});

describe('الشروط', () => {
  const at = new Date('2026-09-03T12:00:00.000Z');

  it('كل الشروط يجب أن تتحقّق', () => {
    const met = conditionsMet(
      [
        { kind: 'time_between', from: '10:00', to: '14:00', timezone: 'UTC' },
        { kind: 'device_state', deviceId: 'tuya:d2', key: 'switch_1', op: 'eq', value: true },
      ],
      { now: at, stateOf: () => true },
    );
    expect(met).toBe(true);
  });

  it('شرط على قيمة لا نعرفها يفشل — لا نخمّن', () => {
    const met = conditionsMet(
      [{ kind: 'device_state', deviceId: 'tuya:x', key: 'temp', op: 'gt', value: 30 }],
      { now: at, stateOf: () => undefined },
    );
    expect(met).toBe(false);
  });

  it('بلا شروط تعني «نفّذ»', () => {
    expect(conditionsMet([], { now: at, stateOf: () => undefined })).toBe(true);
  });
});

describe('المحرّك من طرف إلى طرف', () => {
  const CREDENTIALS = { token: 'سرّ' };
  const DEVICE_ID = 'fake:d1';

  async function harnessWithAccount() {
    const harness = await buildHarness();
    const auth = await harness.authHeader();
    await harness.app.inject({
      method: 'POST',
      url: '/accounts',
      headers: auth,
      payload: { integrationId: 'fake', label: 'بيتي', credentials: CREDENTIALS },
    });
    const me = await harness.app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    return { harness, auth, userId: (me.json() as { id: string }).id };
  }

  const AUTOMATION = {
    name: 'أطفئ المصباح عند تجاوز الاستهلاك',
    enabled: true,
    trigger: { kind: 'state', deviceId: DEVICE_ID, key: 'cur_power', op: 'gt', value: 100 },
    conditions: [],
    actions: [{ kind: 'command', deviceId: DEVICE_ID, key: 'switch_1', value: false }],
  };

  it('تغيّر حالة يُشغّل الإجراء ويُسجَّل التنفيذ', async () => {
    const { harness, auth, userId } = await harnessWithAccount();
    try {
      const created = await harness.app.inject({
        method: 'POST',
        url: '/automations',
        headers: auth,
        payload: AUTOMATION,
      });
      expect(created.statusCode).toBe(201);
      const automationId = (created.json() as { id: string }).id;

      const [device] = await harness.repositories.devices.listByUser(userId);
      await harness.app.statePipeline.apply({
        userId,
        deviceId: device?.id ?? '',
        publicDeviceId: DEVICE_ID,
        values: [{ key: 'cur_power', value: 150 }],
      });
      // الأنبوب يُخطر المحرّك بلا انتظار — نمنحه دورة حدث
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(harness.fake.executed).toContainEqual({
        nativeId: 'd1',
        commands: [{ key: 'switch_1', value: false }],
      });

      const runs = await harness.app.inject({
        method: 'GET',
        url: `/automations/${automationId}/runs`,
        headers: auth,
      });
      expect((runs.json() as { runs: { succeeded: boolean }[] }).runs[0]?.succeeded).toBe(true);
    } finally {
      await harness.app.close();
    }
  });

  it('قراءة دون العتبة لا تُشغّل شيئاً', async () => {
    const { harness, auth, userId } = await harnessWithAccount();
    try {
      await harness.app.inject({
        method: 'POST',
        url: '/automations',
        headers: auth,
        payload: AUTOMATION,
      });

      const [device] = await harness.repositories.devices.listByUser(userId);
      await harness.app.statePipeline.apply({
        userId,
        deviceId: device?.id ?? '',
        publicDeviceId: DEVICE_ID,
        values: [{ key: 'cur_power', value: 20 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(harness.fake.executed).toHaveLength(0);
    } finally {
      await harness.app.close();
    }
  });

  it('أتمتة معطّلة لا تعمل', async () => {
    const { harness, auth, userId } = await harnessWithAccount();
    try {
      await harness.app.inject({
        method: 'POST',
        url: '/automations',
        headers: auth,
        payload: { ...AUTOMATION, enabled: false },
      });

      const [device] = await harness.repositories.devices.listByUser(userId);
      await harness.app.statePipeline.apply({
        userId,
        deviceId: device?.id ?? '',
        publicDeviceId: DEVICE_ID,
        values: [{ key: 'cur_power', value: 500 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(harness.fake.executed).toHaveLength(0);
    } finally {
      await harness.app.close();
    }
  });
});
