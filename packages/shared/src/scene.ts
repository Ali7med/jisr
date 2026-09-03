import { Type, type Static } from '@sinclair/typebox';

/**
 * مشهد: مجموعة أوامر تُنفَّذ بنقرة.
 *
 * **عابر للشركات بطبيعته**: الخطوة تُوجَّه بمعرّف العقد المركّب
 * (`tuya:abc`) لا بمعرّف شركة، فمشهد «سهرة» يُطفئ مصباح Tuya ويشغّل
 * مقبس شركة أخرى في نفس النقرة بلا سطر خاص بأيّهما.
 */
export const SceneStep = Type.Object(
  {
    deviceId: Type.String({ minLength: 1 }),
    key: Type.String({ minLength: 1 }),
    value: Type.Unknown(),
  },
  { $id: 'SceneStep', additionalProperties: false },
);
export type SceneStep = Static<typeof SceneStep>;

export const Scene = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    name: Type.String({ minLength: 1, maxLength: 60 }),
    icon: Type.String(),
    steps: Type.Array(Type.Ref(SceneStep), { minItems: 1 }),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Scene', additionalProperties: false },
);
export type Scene = Static<typeof Scene>;

export const SceneInput = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 60 }),
    icon: Type.String({ default: '' }),
    steps: Type.Array(Type.Ref(SceneStep), { minItems: 1 }),
  },
  { $id: 'SceneInput', additionalProperties: false },
);
export type SceneInput = Static<typeof SceneInput>;

export const SceneList = Type.Object(
  { scenes: Type.Array(Type.Ref(Scene)) },
  { $id: 'SceneList', additionalProperties: false },
);
export type SceneList = Static<typeof SceneList>;

/**
 * نتيجة تشغيل مشهد. **النجاح الجزئي حقيقة لا استثناء**: جهاز واحد غير
 * متصل لا يُلغي المشهد، والواجهة تقول أي خطوة فشلت ولماذا.
 */
export const SceneRunResult = Type.Object(
  {
    sceneId: Type.String({ format: 'uuid' }),
    succeeded: Type.Integer({ minimum: 0 }),
    failed: Type.Integer({ minimum: 0 }),
    failures: Type.Array(
      Type.Object(
        { deviceId: Type.String(), message: Type.String() },
        { additionalProperties: false },
      ),
    ),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'SceneRunResult', additionalProperties: false },
);
export type SceneRunResult = Static<typeof SceneRunResult>;
