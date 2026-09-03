import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ApiError,
  AuthSession,
  AuthTokens,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  UserProfile,
  type ApiError as ApiErrorType,
} from '@jisr/shared';
import { AuthError, type AuthService } from '../auth/service.ts';

/** رسائل عربية تشرح ما العمل (القاعدة الحاكمة 4). */
const FAILURES: Record<string, { status: number; body: ApiErrorType }> = {
  EMAIL_TAKEN: {
    status: 409,
    body: {
      code: 'EMAIL_TAKEN',
      message: 'هذا البريد مسجّل مسبقاً — سجّل الدخول أو استخدم بريداً آخر.',
    },
  },
  INVALID_CREDENTIALS: {
    status: 401,
    body: {
      code: 'INVALID_CREDENTIALS',
      message: 'البريد أو كلمة المرور غير صحيحة — تحقّق منهما وأعد المحاولة.',
    },
  },
  INVALID_REFRESH_TOKEN: {
    status: 401,
    body: {
      code: 'INVALID_REFRESH_TOKEN',
      message: 'انتهت الجلسة أو أُبطلت — سجّل الدخول من جديد.',
    },
  },
};

/**
 * سقف أشدّ من الحدّ العام: المصادقة هدف تخمين كلمات المرور.
 * يُضبط على مستوى المسار — تسجيل الملحق في نطاق فرعي لا يعمل لأنه
 * مُسجَّل عامّاً أصلاً.
 */
const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } } as const;

export const authRoutes: FastifyPluginAsyncTypebox<{ auth: AuthService }> = async (app, opts) => {
  const { auth } = opts;

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      const mapped = FAILURES[error.failure];
      if (mapped) return reply.code(mapped.status).send(mapped.body);
    }
    // ما ليس خطأ مصادقة يعود للمعالج العام
    return reply.send(error);
  });

  app.post(
    '/auth/register',
    {
      config: AUTH_RATE_LIMIT,
      schema: {
        summary: 'إنشاء حساب جديد',
        tags: ['auth'],
        body: Type.Ref(RegisterRequest),
        response: { 201: Type.Ref(AuthSession), 409: Type.Ref(ApiError) },
      },
    },
    async (request, reply) => {
      const session = await auth.register(request.body);
      return reply.code(201).send(session);
    },
  );

  app.post(
    '/auth/login',
    {
      config: AUTH_RATE_LIMIT,
      schema: {
        summary: 'تسجيل الدخول',
        tags: ['auth'],
        body: Type.Ref(LoginRequest),
        response: { 200: Type.Ref(AuthSession), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => auth.login(request.body),
  );

  app.post(
    '/auth/refresh',
    {
      config: AUTH_RATE_LIMIT,
      schema: {
        summary: 'تجديد رمز الوصول (يُدوِّر رمز التجديد)',
        tags: ['auth'],
        body: Type.Ref(RefreshRequest),
        response: { 200: Type.Ref(AuthTokens), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => auth.refresh(request.body.refreshToken),
  );

  app.post(
    '/auth/logout',
    {
      config: AUTH_RATE_LIMIT,
      schema: {
        summary: 'إنهاء الجلسة',
        tags: ['auth'],
        body: Type.Ref(RefreshRequest),
        response: { 204: Type.Null() },
      },
    },
    async (request, reply) => {
      await auth.logout(request.body.refreshToken);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      config: AUTH_RATE_LIMIT,
      onRequest: [app.authenticate],
      schema: {
        summary: 'بيانات المستخدم الحالي',
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        response: { 200: Type.Ref(UserProfile), 401: Type.Ref(ApiError) },
      },
    },
    async (request, reply) => {
      const profile = await auth.profile(request.user.sub);
      if (!profile) {
        const body: ApiErrorType = {
          code: 'USER_NOT_FOUND',
          message: 'لم نعثر على حسابك — قد يكون حُذف. سجّل الدخول من جديد.',
        };
        return reply.code(401).send(body);
      }
      return profile;
    },
  );
};
