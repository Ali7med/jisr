import { describe, expect, it } from 'vitest';
import { dataCenterFromHost, TUYA_DATA_CENTERS } from '../src/integrations/tuya/config.ts';
import {
  mapCapabilities,
  mapCategory,
  mapDevice,
  mapHistory,
  mapKind,
  mapStates,
} from '../src/integrations/tuya/mapper.ts';

const dataCenter = dataCenterFromHost('openapi.tuyaeu.com');

describe('ترجمة الأجهزة', () => {
  it('تبني معرّفاً مركّباً ولا تُسرّب حقول Tuya', () => {
    const device = mapDevice(
      {
        id: 'bf1234',
        name: '  مصباح الصالة ',
        category: 'dj',
        online: true,
        model: 'X1',
        product_name: 'Smart Bulb',
        icon: 'smart/icon/abc.png',
        sub: false,
      },
      { accountId: 'acc-1', dataCenter },
    );

    expect(device.id).toBe('tuya:bf1234');
    expect(device.name).toBe('مصباح الصالة');
    expect(device.category).toBe('light');
    expect(device.iconUrl).toBe('https://images.tuyaeu.com/smart/icon/abc.png');
    expect(device.accountId).toBe('acc-1');
  });

  it('جهاز بلا اسم يأخذ اسماً عربياً بدل الفراغ', () => {
    const device = mapDevice({ id: 'x', name: '   ' }, { accountId: 'a', dataCenter });
    expect(device.name).toBe('جهاز بلا اسم');
    expect(device.online).toBe(false);
  });

  it('فئة غير معروفة تصير other ولا تُسقط الجهاز (القاعدة 3)', () => {
    expect(mapCategory('kg')).toBe('switch');
    expect(mapCategory('لا-يوجد')).toBe('other');
  });

  it('مركز بيانات غير معروف يعود للافتراضي', () => {
    expect(dataCenterFromHost('nope').host).toBe(TUYA_DATA_CENTERS[0]?.host);
  });
});

describe('ترجمة القدرات', () => {
  const specifications = {
    status: [
      { code: 'switch_1', type: 'Boolean', values: '{}' },
      { code: 'cur_power', type: 'Integer', values: '{"min":0,"max":50000,"scale":1,"unit":"W","step":1}' },
    ],
    functions: [
      { code: 'switch_1', type: 'Boolean', values: '{}' },
      { code: 'mode', type: 'Enum', values: '{"range":["white","colour"]}' },
    ],
  };

  it('نقطة في الاثنين ⇒ قراءة وكتابة، وفي status فقط ⇒ قراءة فقط', () => {
    const byKey = new Map(mapCapabilities(specifications).map((c) => [c.key, c]));

    expect(byKey.get('switch_1')).toMatchObject({ kind: 'toggle', writable: true, readable: true });
    expect(byKey.get('cur_power')).toMatchObject({ kind: 'range', writable: false, readable: true });
    expect(byKey.get('mode')).toMatchObject({ kind: 'mode', writable: true, readable: false });
  });

  it('تفكّ قيود `values` القادمة نصّاً يحوي JSON', () => {
    const power = mapCapabilities(specifications).find((c) => c.key === 'cur_power');
    expect(power).toMatchObject({ min: 0, max: 50_000, scale: 1, unit: 'W', step: 1 });
  });

  it('خيارات enum تصل كقائمة نصوص', () => {
    const mode = mapCapabilities(specifications).find((c) => c.key === 'mode');
    expect(mode?.options).toEqual(['white', 'colour']);
  });

  it('قيود غير قابلة للتحليل لا تُسقط القدرة', () => {
    const [capability] = mapCapabilities({ status: [{ code: 'x', type: 'Integer', values: 'ليس JSON' }] });
    expect(capability).toMatchObject({ key: 'x', kind: 'range', step: 1, scale: 0, options: [] });
  });

  it('نوع غير معروف يبقى unknown ولا يُخفى', () => {
    expect(mapKind('bitmap')).toBe('unknown');
    expect(mapKind('BOOLEAN')).toBe('toggle');
  });

  it('مواصفات فارغة أو مشوّهة تُرجع قائمة فارغة', () => {
    expect(mapCapabilities({})).toEqual([]);
    expect(mapCapabilities({ status: 'ليست قائمة' })).toEqual([]);
  });
});

describe('ترجمة الحالة والسجلّ', () => {
  it('تتجاهل المدخلات بلا رمز', () => {
    expect(mapStates([{ code: 'switch_1', value: true }, { value: 1 }, 'نصّ'])).toEqual([
      { key: 'switch_1', value: true },
    ]);
  });

  it('السجلّ يُرتَّب من الأقدم للأحدث وتُستبعد القيم غير الرقمية', () => {
    const points = mapHistory([
      { code: 'cur_power', value: '30', event_time: 2000 },
      { code: 'cur_power', value: '10', event_time: 1000 },
      { code: 'cur_power', value: 'true', event_time: 3000 },
      { code: 'cur_power', value: '', event_time: 4000 },
      { code: '', value: '5', event_time: 5000 },
    ]);

    expect(points.map((p) => p.value)).toEqual([10, 30]);
    expect(points[0]?.at).toBe(new Date(1000).toISOString());
  });

  it('سجلّ غير قائمة يُرجع فارغاً بدل أن يرمي', () => {
    expect(mapHistory(undefined)).toEqual([]);
  });
});
