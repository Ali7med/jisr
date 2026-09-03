import { Type, type Static } from '@sinclair/typebox';
import { Capability } from './capability.js';

/** تصنيف الجهاز — يحمل تسميته العربية في الواجهة، لا في العقد. */
export const DeviceCategory = Type.Union(
  [
    Type.Literal('light'),
    Type.Literal('switch'),
    Type.Literal('socket'),
    Type.Literal('sensor'),
    Type.Literal('climate'),
    Type.Literal('fan'),
    Type.Literal('cover'),
    Type.Literal('lock'),
    Type.Literal('camera'),
    Type.Literal('energy'),
    Type.Literal('remote'),
    Type.Literal('other'),
  ],
  { $id: 'DeviceCategory' },
);
export type DeviceCategory = Static<typeof DeviceCategory>;

/** التسميات العربية — مرجع واحد يستهلكه الويب، والهاتف يحمل نظيره. */
export const DEVICE_CATEGORY_LABELS_AR: Readonly<Record<DeviceCategory, string>> = Object.freeze({
  light: 'إضاءة',
  switch: 'مفاتيح',
  socket: 'مقابس',
  sensor: 'حساسات',
  climate: 'تكييف وتدفئة',
  fan: 'مراوح',
  cover: 'ستائر',
  lock: 'أقفال',
  camera: 'كاميرات',
  energy: 'عدّادات طاقة',
  remote: 'أجهزة تحكّم بالأشعة',
  other: 'أخرى',
});

/**
 * جهاز موحّد. `id` مركّب من `integrationId:nativeId` — لا اسم شركة
 * يتسرّب إلى الواجهة، والمعرّف يبقى فريداً عبر التكاملات.
 */
export const Device = Type.Object(
  {
    id: Type.String({ pattern: '^[^:]+:.+$', examples: ['tuya:bf1234567890abcdef'] }),
    integrationId: Type.String({ minLength: 1 }),
    accountId: Type.String({ minLength: 1 }),
    nativeId: Type.String({ minLength: 1 }),
    name: Type.String(),
    category: Type.Ref(DeviceCategory),
    online: Type.Boolean(),
    model: Type.String({ default: '' }),
    productName: Type.String({ default: '' }),
    iconUrl: Type.Optional(Type.String({ format: 'uri' })),
    room: Type.Optional(Type.String()),
    isSubDevice: Type.Boolean({ default: false }),
    capabilities: Type.Array(Type.Ref(Capability), { default: [] }),
  },
  { $id: 'Device', additionalProperties: false },
);
export type Device = Static<typeof Device>;

const ID_SEPARATOR = ':';

/** يبني معرّف جهاز مركّباً. */
export function makeDeviceId(integrationId: string, nativeId: string): string {
  return `${integrationId}${ID_SEPARATOR}${nativeId}`;
}

/** يفكّ معرّف جهاز مركّباً، ويرمي إن كان غير صالح. */
export function parseDeviceId(id: string): { integrationId: string; nativeId: string } {
  const index = id.indexOf(ID_SEPARATOR);
  if (index <= 0 || index === id.length - 1) {
    throw new Error(`معرّف جهاز غير صالح: ${id}`);
  }
  return { integrationId: id.slice(0, index), nativeId: id.slice(index + 1) };
}

/** قراءة واحدة من قدرة. */
export const StateValue = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    value: Type.Unknown(),
  },
  { $id: 'StateValue', additionalProperties: false },
);
export type StateValue = Static<typeof StateValue>;

/** أمر تحكّم واحد. */
export const Command = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    value: Type.Unknown(),
  },
  { $id: 'Command', additionalProperties: false },
);
export type Command = Static<typeof Command>;

/** نقطة في السجلّ التاريخي. */
export const HistoryPoint = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    value: Type.Number(),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'HistoryPoint', additionalProperties: false },
);
export type HistoryPoint = Static<typeof HistoryPoint>;

/** قائمة الأجهزة — مغلّفة كي تحتمل ترقيماً لاحقاً بلا كسر العقد. */
export const DeviceList = Type.Object(
  { devices: Type.Array(Type.Ref(Device)) },
  { $id: 'DeviceList', additionalProperties: false },
);
export type DeviceList = Static<typeof DeviceList>;

/**
 * لقطة جهاز: بياناته وقدراته وقيمه الحالية — ما تستهلكه شاشة التفاصيل
 * في استدعاء واحد بدل ثلاثة.
 */
export const DeviceSnapshot = Type.Object(
  {
    device: Type.Ref(Device),
    values: Type.Array(Type.Ref(StateValue)),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'DeviceSnapshot', additionalProperties: false },
);
export type DeviceSnapshot = Static<typeof DeviceSnapshot>;

export const CommandRequest = Type.Object(
  { commands: Type.Array(Type.Ref(Command), { minItems: 1 }) },
  { $id: 'CommandRequest', additionalProperties: false },
);
export type CommandRequest = Static<typeof CommandRequest>;

/**
 * الأمر قُبل وأُرسل للشركة — لا يعني أن الجهاز نفّذه. التأكيد يأتي
 * بتغيّر الحالة عبر WS في P2.2، وهذا ما يجعل التحكّم التفاؤلي صادقاً.
 */
export const CommandResult = Type.Object(
  {
    deviceId: Type.String({ minLength: 1 }),
    accepted: Type.Boolean(),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'CommandResult', additionalProperties: false },
);
export type CommandResult = Static<typeof CommandResult>;

/** مصدر السجلّ: قاعدتنا (ADR-0013) أو سحابة الشركة حين لا يزال سجلّنا فارغاً. */
export const HistorySource = Type.Union([Type.Literal('server'), Type.Literal('integration')], {
  $id: 'HistorySource',
});
export type HistorySource = Static<typeof HistorySource>;

export const HistoryResponse = Type.Object(
  {
    deviceId: Type.String({ minLength: 1 }),
    source: Type.Ref(HistorySource),
    points: Type.Array(Type.Ref(HistoryPoint)),
  },
  { $id: 'HistoryResponse', additionalProperties: false },
);
export type HistoryResponse = Static<typeof HistoryResponse>;
