import { Type, type Static } from '@sinclair/typebox';

export const CredentialFieldType = Type.Union(
  [Type.Literal('text'), Type.Literal('secret'), Type.Literal('choice')],
  { $id: 'CredentialFieldType' },
);
export type CredentialFieldType = Static<typeof CredentialFieldType>;

export const CredentialOption = Type.Object(
  {
    value: Type.String(),
    label: Type.String(),
    hint: Type.Optional(Type.String()),
  },
  { $id: 'CredentialOption', additionalProperties: false },
);
export type CredentialOption = Static<typeof CredentialOption>;

/**
 * حقل واحد في نموذج ربط الحساب.
 *
 * الويب والهاتف يبنيان النموذج من هذا الوصف — فإضافة شركة جديدة لا
 * تتطلّب شاشة جديدة (القاعدة الحاكمة 7).
 */
export const CredentialField = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    label: Type.String(),
    type: Type.Ref(CredentialFieldType),
    hint: Type.Optional(Type.String()),
    options: Type.Array(Type.Ref(CredentialOption), { default: [] }),
    defaultValue: Type.Optional(Type.String()),
    required: Type.Boolean({ default: true }),
  },
  { $id: 'CredentialField', additionalProperties: false },
);
export type CredentialField = Static<typeof CredentialField>;

/** بطاقة تعريف تكامل — ما يعرضه الويب في شاشة «أضف حساباً». */
export const IntegrationInfo = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    nameAr: Type.String(),
    nameEn: Type.String(),
    description: Type.String(),
    fields: Type.Array(Type.Ref(CredentialField)),
    setupUrl: Type.Optional(Type.String({ format: 'uri' })),
    supportsHistory: Type.Boolean({ default: false }),
    supportsPairing: Type.Boolean({ default: false }),
  },
  { $id: 'IntegrationInfo', additionalProperties: false },
);
export type IntegrationInfo = Static<typeof IntegrationInfo>;
