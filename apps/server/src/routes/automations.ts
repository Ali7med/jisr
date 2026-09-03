import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ApiError,
  Automation,
  AutomationInput,
  AutomationList,
  AutomationRunList,
} from '@jisr/shared';
import type { AutomationsService } from '../automation/service.ts';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

const ERRORS = { 401: Type.Ref(ApiError), 404: Type.Ref(ApiError) };

export interface AutomationRoutesOptions {
  automations: AutomationsService;
}

/**
 * الأتمتة والمشاهد والإشعارات.
 *
 * الأشكال كلها من العقد المشترك، فبانِي الأتمتة البصري في الويب يُبنى
 * منها ولا يخترع شكلاً خاصاً به — ولا YAML في أي مكان (P5.2).
 */
export const automationRoutes: FastifyPluginAsyncTypebox<AutomationRoutesOptions> = async (
  app,
  opts,
) => {
  const { automations } = opts;
  const guard = { onRequest: [app.authenticate], security: [{ bearerAuth: [] }] };

  app.get(
    '/automations',
    {
      onRequest: guard.onRequest,
      schema: {
        summary: 'أتمتات المستخدم',
        tags: ['automation'],
        security: guard.security,
        response: { 200: Type.Ref(AutomationList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ automations: await automations.list(request.user.sub) }),
  );

  app.post(
    '/automations',
    {
      onRequest: guard.onRequest,
      schema: {
        summary: 'إنشاء أتمتة',
        tags: ['automation'],
        security: guard.security,
        body: Type.Ref(AutomationInput),
        response: { 201: Type.Ref(Automation), ...ERRORS },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await automations.create(request.user.sub, request.body)),
  );

  app.put(
    '/automations/:id',
    {
      onRequest: guard.onRequest,
      schema: {
        summary: 'تعديل أتمتة',
        tags: ['automation'],
        security: guard.security,
        params: IdParams,
        body: Type.Ref(AutomationInput),
        response: { 200: Type.Ref(Automation), ...ERRORS },
      },
    },
    async (request) => automations.update(request.user.sub, request.params.id, request.body),
  );

  app.delete(
    '/automations/:id',
    {
      onRequest: guard.onRequest,
      schema: {
        summary: 'حذف أتمتة',
        tags: ['automation'],
        security: guard.security,
        params: IdParams,
        response: { 204: Type.Null(), ...ERRORS },
      },
    },
    async (request, reply) => {
      await automations.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/automations/:id/runs',
    {
      onRequest: guard.onRequest,
      schema: {
        summary: 'سجلّ تنفيذ أتمتة',
        tags: ['automation'],
        security: guard.security,
        params: IdParams,
        response: { 200: Type.Ref(AutomationRunList), ...ERRORS },
      },
    },
    async (request) => ({ runs: await automations.runs(request.user.sub, request.params.id, 50) }),
  );
};
