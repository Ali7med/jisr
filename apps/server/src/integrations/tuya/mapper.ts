import {
  makeDeviceId,
  type Capability,
  type CapabilityKind,
  type Device,
  type DeviceCategory,
  type HistoryPoint,
  type StateValue,
} from '@jisr/shared';
import { iconUrlOf, TUYA_ID, type TuyaDataCenter } from './config.ts';

/**
 * يترجم استجابات Tuya الخام إلى نماذج العقد المحايدة.
 *
 * **هذا الملف هو حدود Tuya في المشروع.** كل ما هو خاص بها — أسماء
 * الفئات، أنواع الـ DP، شكل حقل `values` — ينتهي هنا. ما فوقه لا يعرف
 * أن Tuya موجودة أصلاً.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// ── الأجهزة ──────────────────────────────────────────────────────────────────

export function mapDevice(
  raw: Record<string, unknown>,
  context: { accountId: string; dataCenter: TuyaDataCenter },
): Device {
  const nativeId = asString(raw['id']);
  const name = asString(raw['name']).trim();
  const icon = iconUrlOf(context.dataCenter, asString(raw['icon']) || undefined);
  const room = asString(raw['room_name'] ?? raw['roomName']).trim();

  return {
    id: makeDeviceId(TUYA_ID, nativeId),
    integrationId: TUYA_ID,
    accountId: context.accountId,
    nativeId,
    name: name || 'جهاز بلا اسم',
    category: mapCategory(asString(raw['category'])),
    online: raw['online'] === true,
    model: asString(raw['model']),
    productName: asString(raw['product_name']),
    ...(icon ? { iconUrl: icon } : {}),
    ...(room ? { room } : {}),
    isSubDevice: raw['sub'] === true,
    capabilities: [],
  };
}

/**
 * فئات Tuya الشائعة → الفئات الموحّدة.
 *
 * أي رمز غير مُدرَج يصير `other` — الجهاز يظهر ويعمل، فقط تجميعه في
 * القائمة يكون أعمّ (القاعدة الحاكمة 3: لا نُخفي ما لا نفهمه).
 */
const CATEGORY_BY_CODE: Readonly<Record<string, DeviceCategory>> = {
  kg: 'switch', tdq: 'switch',
  cz: 'socket', pc: 'socket',
  dj: 'light', dd: 'light', dc: 'light', xdd: 'light', fwd: 'light',
  tgq: 'light', tgkg: 'light', tyndj: 'light',
  wk: 'climate', wkf: 'climate', ktkzq: 'climate', qn: 'climate', kt: 'climate', rs: 'climate',
  fs: 'fan', fskg: 'fan', kj: 'fan',
  cl: 'cover', clkg: 'cover',
  ms: 'lock', jtmspro: 'lock',
  sp: 'camera',
  znrb: 'energy', dlq: 'energy', amy: 'energy', zndb: 'energy',
  wnykq: 'remote', infrared_tv: 'remote', qt: 'remote',
  mc: 'sensor', pir: 'sensor', wsdcg: 'sensor', ldcg: 'sensor', ywbj: 'sensor',
  rqbj: 'sensor', sj: 'sensor', sos: 'sensor', zd: 'sensor', jwbj: 'sensor',
  co2bj: 'sensor', pm25: 'sensor',
};

export function mapCategory(code: string): DeviceCategory {
  return CATEGORY_BY_CODE[code] ?? 'other';
}

// ── القدرات ──────────────────────────────────────────────────────────────────

/**
 * يدمج `functions` و`status` من `/specifications` في قائمة قدرات واحدة.
 *
 * نقطة موجودة في الاثنين ⇒ قابلة للقراءة والكتابة.
 * نقطة في `status` فقط ⇒ قراءة فقط.
 */
export function mapCapabilities(specifications: Record<string, unknown>): Capability[] {
  const statuses = definitions(specifications['status']);
  const functions = definitions(specifications['functions']);

  const byKey = new Map<string, Capability>();
  for (const [key, capability] of statuses) {
    byKey.set(key, { ...capability, writable: false, readable: true });
  }
  for (const [key, capability] of functions) {
    byKey.set(key, { ...capability, writable: true, readable: statuses.has(key) });
  }
  return [...byKey.values()];
}

function definitions(raw: unknown): Map<string, Capability> {
  const result = new Map<string, Capability>();
  if (!Array.isArray(raw)) return result;

  for (const item of raw) {
    const json = asRecord(item);
    if (!json) continue;
    const key = asString(json['code']);
    if (!key) continue;

    const constraints = parseValues(json['values']);
    const min = asNumber(constraints['min']);
    const max = asNumber(constraints['max']);
    const unit = asString(constraints['unit']).trim();
    const range = constraints['range'];

    result.set(key, {
      key,
      kind: mapKind(asString(json['type'])),
      writable: false,
      readable: true,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      step: asNumber(constraints['step']) ?? 1,
      scale: Math.trunc(asNumber(constraints['scale']) ?? 0),
      ...(unit ? { unit } : {}),
      options: Array.isArray(range) ? range.map((option) => `${option}`) : [],
    });
  }
  return result;
}

/** Tuya تستخدم `Integer` في `/specifications` و`Value` في `/functions`. */
export function mapKind(type: string): CapabilityKind {
  switch (type.toLowerCase()) {
    case 'boolean':
    case 'bool':
      return 'toggle';
    case 'integer':
    case 'value':
      return 'range';
    case 'enum':
      return 'mode';
    case 'string':
    case 'json':
    case 'raw':
      return 'text';
    default:
      return 'unknown';
  }
}

/** حقل `values` يصل من Tuya **نصّاً يحوي JSON**، لا كائناً. */
function parseValues(values: unknown): Record<string, unknown> {
  const direct = asRecord(values);
  if (direct) return direct;

  if (typeof values === 'string') {
    const trimmed = values.trim();
    if (!trimmed || trimmed === '{}') return {};
    try {
      return asRecord(JSON.parse(trimmed)) ?? {};
    } catch {
      // قيود غير قابلة للتحليل: نتجاهلها ونعرض القيمة خاماً بدل الانهيار.
      return {};
    }
  }
  return {};
}

// ── الحالة والسجلّ ───────────────────────────────────────────────────────────

export function mapStates(raw: unknown): StateValue[] {
  if (!Array.isArray(raw)) return [];

  const states: StateValue[] = [];
  for (const item of raw) {
    const json = asRecord(item);
    const key = json ? asString(json['code']) : '';
    if (!json || !key) continue;
    states.push({ key, value: json['value'] });
  }
  return states;
}

/** سجلّ Tuya يرجع القيم نصّاً دائماً؛ ما لا يُحلَّل رقماً يُستبعد من الرسم. */
export function mapHistory(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];

  const points: { key: string; value: number; atMs: number }[] = [];
  for (const item of raw) {
    const json = asRecord(item);
    if (!json) continue;
    const key = asString(json['code']);
    const value = Number(`${json['value'] ?? ''}`);
    const atMs = asNumber(json['event_time']);
    if (!key || !Number.isFinite(value) || `${json['value'] ?? ''}`.trim() === '' || atMs === undefined) {
      continue;
    }
    points.push({ key, value, atMs });
  }

  // Tuya ترجعها من الأحدث للأقدم؛ الرسم البياني يحتاج العكس.
  points.sort((a, b) => a.atMs - b.atMs);
  return points.map((point) => ({
    key: point.key,
    value: point.value,
    at: new Date(point.atMs).toISOString(),
  }));
}
