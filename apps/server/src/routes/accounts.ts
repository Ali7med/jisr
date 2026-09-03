import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  Account,
  AccountList,
  ApiError,
  CreateAccountRequest,
  IntegrationList,
  SyncResult,
  UpdateAccountRequest,
} from '@jisr/shared';
import type { AccountsService } from '../accounts/service.ts';

const AccountParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

/** أخطاء مشتركة لكل مسار محروس — تظهر في العقد بدل أن تُكتشف بالتجربة. */
const COMMON_ERRORS = {
  401: Type.Ref(ApiError),
  404: Type.Ref(ApiError),
  502: Type.Ref(ApiError),
};

/**
 * ربط الحسابات وإدارتها.
 *
 * **لا يُذكر اسم شركة في هذا الملف**: النموذج يُبنى من
 * `GET /integrations`، والاعتمادات تُمرَّر خامّاً كما وصفها التكامل
 * (القاعدة الحاكمة 7).
 */
export const accountRoutes: FastifyPluginAsyncTypebox<{ accounts: AccountsService }> = async (
  app,
  opts,
) => {
  const { accounts } = opts;

  app.get(
    '/integrations',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'الشركات المدعومة وحقول ربط كلٍّ منها',
        tags: ['integrations'],
        security: [{ bearerAuth: [] }],
        response: { 200: Type.Ref(IntegrationList), 401: Type.Ref(ApiError) },
      },
    },
    async () => ({ integrations: [...accounts.integrations()] }),
  );

  app.get(
    '/accounts',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'حسابات المستخدم المربوطة',
        tags: ['accounts'],
        security: [{ bearerAuth: [] }],
        response: { 200: Type.Ref(AccountList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ accounts: await accounts.list(request.user.sub) }),
  );

  app.post(
    '/accounts',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'ربط حساب جديد (يتحقّق من الاعتمادات قبل الحفظ ثم يزامن)',
        tags: ['accounts'],
        security: [{ bearerAuth: [] }],
        body: Type.Ref(CreateAccountRequest),
        response: { 201: Type.Ref(Account), ...COMMON_ERRORS },
      },
    },
    async (request, reply) => {
      const account = await accounts.create(request.user.sub, request.body);
      return reply.code(201).send(account);
    },
  );

  app.patch(
    '/accounts/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'تعديل التسمية أو تحديث الاعتمادات',
        tags: ['accounts'],
        security: [{ bearerAuth: [] }],
        params: AccountParams,
        body: Type.Ref(UpdateAccountRequest),
        response: { 200: Type.Ref(Account), ...COMMON_ERRORS },
      },
    },
    async (request) => accounts.update(request.user.sub, request.params.id, request.body),
  );

  app.delete(
    '/accounts/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'فكّ ربط الحساب وحذف أجهزته وسجلّها',
        tags: ['accounts'],
        security: [{ bearerAuth: [] }],
        params: AccountParams,
        response: { 204: Type.Null(), 401: Type.Ref(ApiError), 404: Type.Ref(ApiError) },
      },
    },
    async (request, reply) => {
      await accounts.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/accounts/:id/sync',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'إعادة جلب أجهزة الحساب من الشركة',
        tags: ['accounts'],
        security: [{ bearerAuth: [] }],
        params: AccountParams,
        response: { 200: Type.Ref(SyncResult), ...COMMON_ERRORS },
      },
    },
    async (request) => accounts.sync(request.user.sub, request.params.id),
  );
};
