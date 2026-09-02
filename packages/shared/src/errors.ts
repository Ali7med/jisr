import { Type, type Static } from '@sinclair/typebox';

/**
 * خطأ موحّد. القاعدة الحاكمة 4: كل رسالة عربية وتشرح **ما العمل** —
 * لذلك `message` عربي إلزامي، و`code` للتشخيص لا للعرض.
 */
export const ApiError = Type.Object(
  {
    code: Type.String({ examples: ['NOT_FOUND', 'UNAUTHORIZED', 'INTEGRATION_UNAVAILABLE'] }),
    message: Type.String({ description: 'رسالة عربية تشرح ما العمل' }),
    /** تفاصيل تشخيصية اختيارية — لا تُعرض للمستخدم ولا تحمل أسراراً. */
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { $id: 'ApiError', additionalProperties: false },
);
export type ApiError = Static<typeof ApiError>;
