import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  AcceptInvitationRequest,
  ActivityList,
  ApiError,
  Invitation,
  InvitationInput,
  InvitationList,
  Member,
  MemberList,
  PermissionsInput,
} from '@jisr/shared';
import type { HouseholdService } from '../household/service.ts';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const ERRORS = { 401: Type.Ref(ApiError), 403: Type.Ref(ApiError), 404: Type.Ref(ApiError) };

/**
 * العائلة: الأعضاء وأذونهم، الدعوات، وسجلّ النشاط.
 *
 * كل مسار هنا يعمل في **مساحة المستخدم المُصادَق** — لا معامل «مالك»
 * يُمرَّر من العميل، فلا سبيل لإدارة مساحة غيرك بتغيير معرّف في الطلب.
 */
export const householdRoutes: FastifyPluginAsyncTypebox<{ household: HouseholdService }> = async (
  app,
  opts,
) => {
  const { household } = opts;
  const onRequest = [app.authenticate];
  const security = [{ bearerAuth: [] }];

  app.get(
    '/household/members',
    {
      onRequest,
      schema: {
        summary: 'أعضاء مساحتك وأذونهم',
        tags: ['household'],
        security,
        response: { 200: Type.Ref(MemberList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ members: await household.members(request.user.sub) }),
  );

  app.put(
    '/household/members/:id/permissions',
    {
      onRequest,
      schema: {
        summary: 'ضبط أذون عضو (استبدال كامل للقائمة)',
        tags: ['household'],
        security,
        params: IdParams,
        body: Type.Ref(PermissionsInput),
        response: { 200: Type.Ref(Member), ...ERRORS },
      },
    },
    async (request) =>
      household.setPermissions(request.user.sub, request.params.id, request.body),
  );

  app.delete(
    '/household/members/:id',
    {
      onRequest,
      schema: {
        summary: 'إزالة عضو',
        tags: ['household'],
        security,
        params: IdParams,
        response: { 204: Type.Null(), ...ERRORS },
      },
    },
    async (request, reply) => {
      await household.removeMember(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/household/invitations',
    {
      onRequest,
      schema: {
        summary: 'الدعوات المرسلة',
        tags: ['household'],
        security,
        response: { 200: Type.Ref(InvitationList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ invitations: await household.invitations(request.user.sub) }),
  );

  app.post(
    '/household/invitations',
    {
      onRequest,
      schema: {
        summary: 'دعوة فرد',
        description: 'الرمز يظهر في هذا الردّ **مرة واحدة فقط** — انسخه وأرسله بنفسك.',
        tags: ['household'],
        security,
        body: Type.Ref(InvitationInput),
        response: { 201: Type.Ref(Invitation), ...ERRORS },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await household.invite(request.user.sub, request.body)),
  );

  app.delete(
    '/household/invitations/:id',
    {
      onRequest,
      schema: {
        summary: 'إلغاء دعوة',
        tags: ['household'],
        security,
        params: IdParams,
        response: { 204: Type.Null(), ...ERRORS },
      },
    },
    async (request, reply) => {
      await household.revokeInvitation(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/household/invitations/accept',
    {
      onRequest,
      schema: {
        summary: 'قبول دعوة',
        description: 'يشترط تطابق البريد المدعوّ مع بريد حسابك.',
        tags: ['household'],
        security,
        body: Type.Ref(AcceptInvitationRequest),
        response: { 200: Type.Ref(Member), 400: Type.Ref(ApiError), ...ERRORS },
      },
    },
    async (request) => household.accept(request.user.sub, request.body.token),
  );

  app.get(
    '/household/activity',
    {
      onRequest,
      schema: {
        summary: 'سجلّ النشاط: مَن فعل ماذا ومتى',
        tags: ['household'],
        security,
        response: { 200: Type.Ref(ActivityList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ entries: await household.activity(request.user.sub, 100) }),
  );
};
