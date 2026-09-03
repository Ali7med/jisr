import { Type, type Static } from '@sinclair/typebox';

/**
 * الحدّ الأدنى لكلمة المرور: ١٠ محارف. لا نفرض رموزاً وأرقاماً — تلك
 * القواعد تدفع الناس لأنماط متوقّعة؛ الطول أنفع.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const RegisterRequest = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 254 }),
    password: Type.String({ minLength: PASSWORD_MIN_LENGTH, maxLength: 200 }),
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { $id: 'RegisterRequest', additionalProperties: false },
);
export type RegisterRequest = Static<typeof RegisterRequest>;

export const LoginRequest = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 254 }),
    password: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { $id: 'LoginRequest', additionalProperties: false },
);
export type LoginRequest = Static<typeof LoginRequest>;

export const RefreshRequest = Type.Object(
  { refreshToken: Type.String({ minLength: 1 }) },
  { $id: 'RefreshRequest', additionalProperties: false },
);
export type RefreshRequest = Static<typeof RefreshRequest>;

export const UserProfile = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    email: Type.String({ format: 'email' }),
    displayName: Type.String(),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'UserProfile', additionalProperties: false },
);
export type UserProfile = Static<typeof UserProfile>;

/** رمز الوصول قصير العمر، ورمز التجديد يُدوَّر مع كل استخدام. */
export const AuthTokens = Type.Object(
  {
    accessToken: Type.String(),
    refreshToken: Type.String(),
    expiresInSeconds: Type.Integer({ minimum: 1 }),
    tokenType: Type.Literal('Bearer'),
  },
  { $id: 'AuthTokens', additionalProperties: false },
);
export type AuthTokens = Static<typeof AuthTokens>;

export const AuthSession = Type.Object(
  {
    user: Type.Ref(UserProfile),
    tokens: Type.Ref(AuthTokens),
  },
  { $id: 'AuthSession', additionalProperties: false },
);
export type AuthSession = Static<typeof AuthSession>;
