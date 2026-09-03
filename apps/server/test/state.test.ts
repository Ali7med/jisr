import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent, StateValue } from '@jisr/shared';
import { createStateBus } from '../src/state/bus.ts';
import { createStatePipeline } from '../src/state/pipeline.ts';
import { createStatePoller } from '../src/state/poller.ts';
import { createRetentionJob } from '../src/state/retention.ts';
import type { Integration } from '../src/integrations/types.ts';
import { createMemoryRepositories } from './support/memory-repositories.ts';

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => silentLog,
  level: 'silent',
  silent: () => {},
} as unknown as Parameters<typeof createStatePoller>[0]['log'];

describe('ناقل الأحداث', () => {
  it('يوصل الحدث لمشتركي المستخدم وحدهم', () => {
    const bus = createStateBus();
    const mine: RealtimeEvent[] = [];
    const other: RealtimeEvent[] = [];

    bus.subscribe('u1', (event) => mine.push(event));
    bus.subscribe('u2', (event) => other.push(event));
    bus.publish('u1', { type: 'hello', at: '2026-09-03T00:00:00.000Z' });

    expect(mine).toHaveLength(1);
    expect(other).toHaveLength(0);
  });

  it('إلغاء الاشتراك ينظّف القناة فلا تتسرّب المستمعات', () => {
    const bus = createStateBus();
    const off = bus.subscribe('u1', () => {});
    expect(bus.subscriberCount('u1')).toBe(1);

    off();
    expect(bus.subscriberCount()).toBe(0);
  });

  it('مشترك يرمي لا يمنع البقية', () => {
    const bus = createStateBus();
    const received: RealtimeEvent[] = [];
    bus.subscribe('u1', () => {
      throw new Error('مقبس مغلق');
    });
    bus.subscribe('u1', (event) => received.push(event));

    expect(() => bus.publish('u1', { type: 'hello', at: 'x' })).not.toThrow();
    expect(received).toHaveLength(1);
  });
});

describe('أنبوب الحالة', () => {
  function setup() {
    const repositories = createMemoryRepositories();
    const bus = createStateBus();
    const events: RealtimeEvent[] = [];
    bus.subscribe('u1', (event) => events.push(event));
    return { repositories, bus, events, pipeline: createStatePipeline({ repositories, bus }) };
  }

  const update = (values: StateValue[]) => ({
    userId: 'u1',
    deviceId: 'dev-uuid',
    publicDeviceId: 'fake:d1',
    values,
  });

  it('أول قراءة تُحفظ وتُنشر', async () => {
    const { pipeline, events, repositories } = setup();

    const changed = await pipeline.apply(update([{ key: 'switch_1', value: true }]));

    expect(changed).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'state', deviceId: 'fake:d1' });
    const stored = await repositories.history.list({
      deviceId: 'dev-uuid',
      keys: [],
      start: new Date(0),
      end: new Date(Date.now() + 1000),
      limit: 10,
    });
    expect(stored).toHaveLength(1);
  });

  it('قيمة لم تتغيّر لا تُحفظ ولا تُنشر', async () => {
    const { pipeline, events } = setup();

    await pipeline.apply(update([{ key: 'switch_1', value: true }]));
    const changed = await pipeline.apply(update([{ key: 'switch_1', value: true }]));

    expect(changed).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it('ينشر ما تغيّر فقط من دفعة فيها ثابت ومتغيّر', async () => {
    const { pipeline, events } = setup();

    await pipeline.apply(
      update([
        { key: 'switch_1', value: true },
        { key: 'cur_power', value: 10 },
      ]),
    );
    await pipeline.apply(
      update([
        { key: 'switch_1', value: true },
        { key: 'cur_power', value: 12 },
      ]),
    );

    expect(events).toHaveLength(2);
    expect((events[1] as { values: StateValue[] }).values).toEqual([
      { key: 'cur_power', value: 12 },
    ]);
  });

  it('يقارن القيم المركّبة بمحتواها لا بمرجعها', async () => {
    const { pipeline, events } = setup();

    await pipeline.apply(update([{ key: 'colour', value: { h: 1, s: 2 } }]));
    await pipeline.apply(update([{ key: 'colour', value: { h: 1, s: 2 } }]));

    expect(events).toHaveLength(1);
  });

  it('نسيان جهاز يعيد أول قراءة بعده جديدة', async () => {
    const { pipeline, events } = setup();

    await pipeline.apply(update([{ key: 'switch_1', value: true }]));
    pipeline.forget('dev-uuid');
    await pipeline.apply(update([{ key: 'switch_1', value: true }]));

    expect(events).toHaveLength(2);
  });
});

describe('مستقصي الحالة', () => {
  const device = (nativeId: string, online: boolean) => ({
    nativeId,
    integrationId: 'fake',
    name: 'جهاز',
    category: 'light',
    online,
    model: '',
    productName: '',
    iconUrl: null,
    room: null,
    isSubDevice: false,
  });

  async function seed() {
    const repositories = createMemoryRepositories();
    const account = await repositories.accounts.create({
      userId: 'u1',
      integrationId: 'fake',
      label: 'بيتي',
      secretsCipher: new Uint8Array(1),
      secretsIv: new Uint8Array(1),
      secretsTag: new Uint8Array(1),
      keyVersion: 1,
    });
    await repositories.devices.replaceForAccount(account.id, [
      device('d1', true),
      device('d2', false),
    ]);
    return { repositories, account };
  }

  function fakeIntegration(fetchState: () => Promise<StateValue[]>) {
    const calls: string[] = [];
    const integration = {
      async fetchState(nativeId: string) {
        calls.push(nativeId);
        return fetchState();
      },
      dispose: vi.fn(),
    } as unknown as Integration;
    return { integration, calls };
  }

  it('يستقصي الأجهزة المتصلة فقط ويمرّرها للأنبوب', async () => {
    const { repositories } = await seed();
    const bus = createStateBus();
    const events: RealtimeEvent[] = [];
    bus.subscribe('u1', (event) => events.push(event));
    const { integration, calls } = fakeIntegration(async () => [{ key: 'switch_1', value: true }]);

    const poller = createStatePoller({
      repositories,
      opener: { open: () => integration },
      pipeline: createStatePipeline({ repositories, bus }),
      intervalMs: 0,
      log: silentLog,
    });
    await poller.tick();

    expect(calls).toEqual(['d1']);
    expect(events).toHaveLength(1);
  });

  it('فشل حساب لا يُسقط الدورة', async () => {
    const { repositories } = await seed();
    const { integration } = fakeIntegration(async () => {
      throw new Error('انقطاع');
    });

    const poller = createStatePoller({
      repositories,
      opener: { open: () => integration },
      pipeline: createStatePipeline({ repositories, bus: createStateBus() }),
      intervalMs: 0,
      log: silentLog,
    });

    await expect(poller.tick()).resolves.toBeUndefined();
  });

  it('لا يستقصي حساباً معطّل الاعتمادات', async () => {
    const { repositories, account } = await seed();
    await repositories.accounts.update(account.id, { status: 'invalid_credentials' });
    const { integration, calls } = fakeIntegration(async () => []);

    const poller = createStatePoller({
      repositories,
      opener: { open: () => integration },
      pipeline: createStatePipeline({ repositories, bus: createStateBus() }),
      intervalMs: 0,
      log: silentLog,
    });
    await poller.tick();

    expect(calls).toEqual([]);
  });
});

describe('سياسة الاستبقاء', () => {
  it('تحذف ما تجاوز المدة وتُبقي ما دونها', async () => {
    const repositories = createMemoryRepositories();
    const now = new Date('2026-09-03T00:00:00.000Z');
    await repositories.history.record([
      {
        deviceId: 'd',
        key: 'k',
        value: 1,
        rawValue: null,
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        deviceId: 'd',
        key: 'k',
        value: 2,
        rawValue: null,
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);

    const job = createRetentionJob({
      repositories,
      retentionDays: 90,
      intervalMs: 0,
      log: silentLog,
      now: () => now,
    });

    expect(await job.tick()).toBe(1);
    const left = await repositories.history.list({
      deviceId: 'd',
      keys: [],
      start: new Date(0),
      end: now,
      limit: 100,
    });
    expect(left).toHaveLength(1);
  });
});
