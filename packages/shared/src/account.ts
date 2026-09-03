import { Type, type Static } from '@sinclair/typebox';

/**
 * حالة الحساب المربوط — يقرأها الويب ليعرض تنبيهاً قبل أن يفاجأ
 * المستخدم بتوقّف أجهزته (الدراسة § 7: انتهاء اشتراك Tuya).
 */
export const AccountStatus = Type.Union(
  [
    Type.Literal('active', { description: 'يعمل' }),
    Type.Literal('invalid_credentials', { description: 'اعتمادات مرفوضة — يلزم إعادة الإعداد' }),
    Type.Literal('expired', { description: 'انتهى اشتراك المشروع لدى الشركة' }),
    Type.Literal('disabled', { description: 'أوقفه المستخدم' }),
  ],
  { $id: 'AccountStatus' },
);
export type AccountStatus = Static<typeof AccountStatus>;

/**
 * حساب مربوط كما يراه العميل — **بلا أي سرّ**: الاعتمادات تُشفَّر على
 * السيرفر ولا تخرج منه أبداً (الهيكلية § 7).
 */
export const Account = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    integrationId: Type.String({ minLength: 1 }),
    label: Type.String(),
    status: Type.Ref(AccountStatus),
    deviceCount: Type.Integer({ minimum: 0 }),
    credentialsExpireAt: Type.Optional(Type.String({ format: 'date-time' })),
    lastCheckedAt: Type.Optional(Type.String({ format: 'date-time' })),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Account', additionalProperties: false },
);
export type Account = Static<typeof Account>;

/** قيم حقول الاعتماد بمفاتيح `IntegrationInfo.fields`. */
export const Credentials = Type.Record(Type.String(), Type.String(), {
  $id: 'Credentials',
  description: 'قيم حقول الاعتماد — تُشفَّر فور وصولها ولا تُعاد أبداً',
});
export type Credentials = Static<typeof Credentials>;

export const CreateAccountRequest = Type.Object(
  {
    integrationId: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1, maxLength: 60 }),
    credentials: Type.Ref(Credentials),
  },
  { $id: 'CreateAccountRequest', additionalProperties: false },
);
export type CreateAccountRequest = Static<typeof CreateAccountRequest>;

/** تعديل جزئي: تسمية فقط، أو اعتمادات جديدة تُتحقّق قبل الحفظ. */
export const UpdateAccountRequest = Type.Object(
  {
    label: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
    credentials: Type.Optional(Type.Ref(Credentials)),
  },
  { $id: 'UpdateAccountRequest', additionalProperties: false },
);
export type UpdateAccountRequest = Static<typeof UpdateAccountRequest>;

export const AccountList = Type.Object(
  { accounts: Type.Array(Type.Ref(Account)) },
  { $id: 'AccountList', additionalProperties: false },
);
export type AccountList = Static<typeof AccountList>;

/** نتيجة مزامنة حساب — كم جهازاً ظهر، وكم اختفى. */
export const SyncResult = Type.Object(
  {
    accountId: Type.String({ format: 'uuid' }),
    deviceCount: Type.Integer({ minimum: 0 }),
    added: Type.Integer({ minimum: 0 }),
    removed: Type.Integer({ minimum: 0 }),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'SyncResult', additionalProperties: false },
);
export type SyncResult = Static<typeof SyncResult>;
