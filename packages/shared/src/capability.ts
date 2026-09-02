import { Type, type Static } from '@sinclair/typebox';

/**
 * نوع القدرة — **محايد تجاه الشركة المصنّعة**.
 *
 * كل تكامل يترجم مفاهيمه إلى هذه الأنواع: Tuya تترجم `Boolean`→toggle
 * و`Integer`→range، وTasmota تترجم `POWER`→toggle. الواجهة تعرف هذه
 * الأنواع فقط ولا تعرف أي شركة.
 */
export const CapabilityKind = Type.Union(
  [
    Type.Literal('toggle', { description: 'تشغيل/إطفاء' }),
    Type.Literal('range', { description: 'قيمة عددية ضمن مدى' }),
    Type.Literal('mode', { description: 'اختيار من قائمة محدّدة' }),
    Type.Literal('text', { description: 'قراءة نصية لا تُحرَّر' }),
    Type.Literal('unknown', { description: 'لم نتعرّف عليه — يُعرض خاماً ولا يُخفى' }),
  ],
  { $id: 'CapabilityKind' },
);
export type CapabilityKind = Static<typeof CapabilityKind>;

/**
 * قدرة واحدة على جهاز: ما يمكن قراءته أو التحكّم به.
 *
 * يوحّد ما تسمّيه Tuya «نقطة بيانات (DP)» وما تسمّيه غيرها
 * «attribute» أو «channel» أو «entity».
 */
export const Capability = Type.Object(
  {
    /** المعرّف داخل التكامل — `switch_1` في Tuya، `POWER1` في Tasmota. */
    key: Type.String({ minLength: 1 }),
    kind: Type.Ref(CapabilityKind),
    /** هل يمكن إرسال أمر لتغييرها؟ */
    writable: Type.Boolean(),
    /** هل تُبلّغ عن قيمة يمكن عرضها؟ */
    readable: Type.Boolean({ default: true }),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    step: Type.Number({ default: 1 }),
    /**
     * أُسّ العشرة الذي تُقسم عليه القيمة الخام للعرض: 235 مع `scale: 1` ⇒ 23.5
     * مفهوم من Tuya لكنه شائع؛ تكامل بلا هذا المفهوم يتركه صفراً.
     */
    scale: Type.Integer({ default: 0 }),
    unit: Type.Optional(Type.String()),
    /** خيارات `mode`. */
    options: Type.Array(Type.String(), { default: [] }),
  },
  { $id: 'Capability', additionalProperties: false },
);
export type Capability = Static<typeof Capability>;

/** القيمة الخام → المعروضة. */
export function toDisplay(capability: Pick<Capability, 'scale'>, value: number): number {
  return value / 10 ** capability.scale;
}

/** القيمة المعروضة → الخام المرسلة للجهاز. */
export function fromDisplay(capability: Pick<Capability, 'scale'>, display: number): number {
  return Math.round(display * 10 ** capability.scale);
}
