import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ApiError,
  NotificationList,
  Scene,
  SceneInput,
  SceneList,
  SceneRunResult,
} from '@jisr/shared';
import type { NotificationsService } from '../automation/service.ts';
import type { ScenesService } from '../automation/scenes.ts';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const ERRORS = { 401: Type.Ref(ApiError), 404: Type.Ref(ApiError) };

export const sceneRoutes: FastifyPluginAsyncTypebox<{
  scenes: ScenesService;
  notifications: NotificationsService;
}> = async (app, opts) => {
  const { scenes, notifications } = opts;
  const onRequest = [app.authenticate];
  const security = [{ bearerAuth: [] }];

  app.get(
    '/scenes',
    {
      onRequest,
      schema: {
        summary: 'مشاهد المستخدم',
        tags: ['automation'],
        security,
        response: { 200: Type.Ref(SceneList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ scenes: await scenes.list(request.user.sub) }),
  );

  app.post(
    '/scenes',
    {
      onRequest,
      schema: {
        summary: 'إنشاء مشهد',
        tags: ['automation'],
        security,
        body: Type.Ref(SceneInput),
        response: { 201: Type.Ref(Scene), ...ERRORS },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await scenes.create(request.user.sub, request.body)),
  );

  app.delete(
    '/scenes/:id',
    {
      onRequest,
      schema: {
        summary: 'حذف مشهد',
        tags: ['automation'],
        security,
        params: IdParams,
        response: { 204: Type.Null(), ...ERRORS },
      },
    },
    async (request, reply) => {
      await scenes.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/scenes/:id/run',
    {
      onRequest,
      schema: {
        summary: 'تشغيل مشهد',
        description: 'النجاح الجزئي ممكن: جهاز غير متصل لا يُلغي بقية الخطوات.',
        tags: ['automation'],
        security,
        params: IdParams,
        response: { 200: Type.Ref(SceneRunResult), ...ERRORS },
      },
    },
    async (request) => scenes.run(request.user.sub, request.params.id),
  );

  app.get(
    '/notifications',
    {
      onRequest,
      schema: {
        summary: 'إشعارات المستخدم',
        tags: ['automation'],
        security,
        response: { 200: Type.Ref(NotificationList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => notifications.list(request.user.sub, 50),
  );

  app.post(
    '/notifications/read',
    {
      onRequest,
      schema: {
        summary: 'تعليم كل الإشعارات مقروءة',
        tags: ['automation'],
        security,
        response: { 204: Type.Null(), 401: Type.Ref(ApiError) },
      },
    },
    async (request, reply) => {
      await notifications.markAllRead(request.user.sub);
      return reply.code(204).send(null);
    },
  );
};
