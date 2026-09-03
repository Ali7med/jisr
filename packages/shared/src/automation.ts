import { Type, type Static } from '@sinclair/typebox';

/**
 * عقد الأتمتة — **ما يبنيه بانِي الأتمتة البصري ولا يكتبه المستخدم**.
 *
 * لا YAML ولا لغة تعبيرات: مُشغِّل واحد، وشروط تُقرأ من قائمة، وإجراءات.
 * كل ما يظهر في الواجهة العربية مشتقّ من هذه الأشكال (P5.2).
 */

/** موازنة قيمة — `changed` تعني «تغيّرت لأي قيمة». */
export const CompareOp = Type.Union(
  [
    Type.Literal('eq'),
    Type.Literal('ne'),
    Type.Literal('gt'),
    Type.Literal('gte'),
    Type.Literal('lt'),
    Type.Literal('lte'),
    Type.Literal('changed'),
  ],
  { $id: 'CompareOp' },
);
export type CompareOp = Static<typeof CompareOp>;

/** «حين تصير قراءة الجهاز كذا» — يصل عبر القناة فيُقيَّم فوراً. */
export const StateTrigger = Type.Object(
  {
    kind: Type.Literal('state'),
    deviceId: Type.String({ minLength: 1 }),
    key: Type.String({ minLength: 1 }),
    op: Type.Ref(CompareOp),
    value: Type.Optional(Type.Unknown()),
  },
  { $id: 'StateTrigger', additionalProperties: false },
);
export type StateTrigger = Static<typeof StateTrigger>;

/**
 * «كل يوم الساعة كذا». الوقت بتوقيت المستخدم المعلن في `timezone`
 * (IANA) — تخزين «07:00» بلا منطقة يعني أتمتة تعمل في وقت خاطئ.
 */
export const ScheduleTrigger = Type.Object(
  {
    kind: Type.Literal('schedule'),
    at: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', examples: ['07:30'] }),
    /** 0 = الأحد. فارغة تعني كل يوم. */
    days: Type.Array(Type.Integer({ minimum: 0, maximum: 6 })),
    /**
     * بلا قيمة افتراضية عمداً: الأشكال داخل اتحاد لا تُطبَّق فيها
     * القيم الافتراضية، فافتراضٌ صامت هنا يعني أتمتة تعمل بتوقيت خاطئ.
     * المرسِل يصرّح بالمنطقة.
     */
    timezone: Type.String({ minLength: 1, examples: ['Asia/Baghdad'] }),
  },
  { $id: 'ScheduleTrigger', additionalProperties: false },
);
export type ScheduleTrigger = Static<typeof ScheduleTrigger>;

export const AutomationTrigger = Type.Union(
  [Type.Ref(StateTrigger), Type.Ref(ScheduleTrigger)],
  { $id: 'AutomationTrigger' },
);
export type AutomationTrigger = Static<typeof AutomationTrigger>;

/** «بشرط أن الوقت بين…» — تجاوز منتصف الليل مسموح (22:00 ← 06:00). */
export const TimeCondition = Type.Object(
  {
    kind: Type.Literal('time_between'),
    from: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }),
    to: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }),
    timezone: Type.String({ minLength: 1, examples: ['Asia/Baghdad'] }),
  },
  { $id: 'TimeCondition', additionalProperties: false },
);
export type TimeCondition = Static<typeof TimeCondition>;

/** «وبشرط أن جهازاً آخر حاله كذا». */
export const StateCondition = Type.Object(
  {
    kind: Type.Literal('device_state'),
    deviceId: Type.String({ minLength: 1 }),
    key: Type.String({ minLength: 1 }),
    op: Type.Ref(CompareOp),
    value: Type.Optional(Type.Unknown()),
  },
  { $id: 'StateCondition', additionalProperties: false },
);
export type StateCondition = Static<typeof StateCondition>;

export const AutomationCondition = Type.Union(
  [Type.Ref(TimeCondition), Type.Ref(StateCondition)],
  { $id: 'AutomationCondition' },
);
export type AutomationCondition = Static<typeof AutomationCondition>;

export const CommandAction = Type.Object(
  {
    kind: Type.Literal('command'),
    deviceId: Type.String({ minLength: 1 }),
    key: Type.String({ minLength: 1 }),
    value: Type.Unknown(),
  },
  { $id: 'CommandAction', additionalProperties: false },
);
export type CommandAction = Static<typeof CommandAction>;

export const SceneAction = Type.Object(
  { kind: Type.Literal('scene'), sceneId: Type.String({ format: 'uuid' }) },
  { $id: 'SceneAction', additionalProperties: false },
);
export type SceneAction = Static<typeof SceneAction>;

export const NotifySeverity = Type.Union(
  [Type.Literal('info'), Type.Literal('warning'), Type.Literal('critical')],
  { $id: 'NotifySeverity' },
);
export type NotifySeverity = Static<typeof NotifySeverity>;

export const NotifyAction = Type.Object(
  {
    kind: Type.Literal('notify'),
    title: Type.String({ minLength: 1, maxLength: 80 }),
    body: Type.String({ maxLength: 300 }),
    severity: Type.Ref(NotifySeverity),
  },
  { $id: 'NotifyAction', additionalProperties: false },
);
export type NotifyAction = Static<typeof NotifyAction>;

export const AutomationAction = Type.Union(
  [Type.Ref(CommandAction), Type.Ref(SceneAction), Type.Ref(NotifyAction)],
  { $id: 'AutomationAction' },
);
export type AutomationAction = Static<typeof AutomationAction>;

export const Automation = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    name: Type.String({ minLength: 1, maxLength: 80 }),
    enabled: Type.Boolean(),
    trigger: Type.Ref(AutomationTrigger),
    conditions: Type.Array(Type.Ref(AutomationCondition)),
    actions: Type.Array(Type.Ref(AutomationAction), { minItems: 1 }),
    lastRunAt: Type.Optional(Type.String({ format: 'date-time' })),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Automation', additionalProperties: false },
);
export type Automation = Static<typeof Automation>;

export const AutomationInput = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 80 }),
    enabled: Type.Boolean({ default: true }),
    trigger: Type.Ref(AutomationTrigger),
    conditions: Type.Array(Type.Ref(AutomationCondition), { default: [] }),
    actions: Type.Array(Type.Ref(AutomationAction), { minItems: 1 }),
  },
  { $id: 'AutomationInput', additionalProperties: false },
);
export type AutomationInput = Static<typeof AutomationInput>;

export const AutomationList = Type.Object(
  { automations: Type.Array(Type.Ref(Automation)) },
  { $id: 'AutomationList', additionalProperties: false },
);
export type AutomationList = Static<typeof AutomationList>;

/** سجلّ تنفيذ — يجعل «لماذا لم تعمل أتمتتي؟» سؤالاً له جواب. */
export const AutomationRun = Type.Object(
  {
    succeeded: Type.Boolean(),
    detail: Type.String(),
    ranAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'AutomationRun', additionalProperties: false },
);
export type AutomationRun = Static<typeof AutomationRun>;

export const AutomationRunList = Type.Object(
  { runs: Type.Array(Type.Ref(AutomationRun)) },
  { $id: 'AutomationRunList', additionalProperties: false },
);
export type AutomationRunList = Static<typeof AutomationRunList>;
