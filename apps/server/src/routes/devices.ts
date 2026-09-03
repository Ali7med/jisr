import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ApiError,
  CommandRequest,
  CommandResult,
  DeviceList,
  DeviceSnapshot,
  HistoryResponse,
} from '@jisr/shared';
import type { DevicesService } from '../devices/service.ts';

/** معرّف العقد المركّب `integrationId:nativeId` — لا معرّف داخلي يتسرّب. */
const DeviceParams = Type.Object({
  id: Type.String({ pattern: '^[^:]+:.+$', examples: ['tuya:bf1234567890abcdef'] }),
});

const HistoryQuery = Type.Object({
  keys: Type.Optional(Type.String({ description: 'مفاتيح القدرات مفصولة بفواصل' })),
  start: Type.Optional(Type.String({ format: 'date-time' })),
  end: Type.Optional(Type.String({ format: 'date-time' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 100 })),
});

const COMMON_ERRORS = {
  401: Type.Ref(ApiError),
  404: Type.Ref(ApiError),
  502: Type.Ref(ApiError),
};

const DAY_MS = 86_400_000;

export const deviceRoutes: FastifyPluginAsyncTypebox<{ devices: DevicesService }> = async (
  app,
  opts,
) => {
  const { devices } = opts;

  app.get(
    '/devices',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'كل أجهزة المستخدم عبر كل حساباته',
        description: 'تُقرأ من قاعدتنا لا من الشركة — لا تستهلك حصّة استدعاءات.',
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        response: { 200: Type.Ref(DeviceList), 401: Type.Ref(ApiError) },
      },
    },
    async (request) => ({ devices: await devices.list(request.user.sub) }),
  );

  app.get(
    '/devices/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'لقطة جهاز: بياناته وقدراته وقيمه الحالية',
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        params: DeviceParams,
        response: { 200: Type.Ref(DeviceSnapshot), ...COMMON_ERRORS },
      },
    },
    async (request) => devices.snapshot(request.user.sub, request.params.id),
  );

  app.post(
    '/devices/:id/commands',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'تنفيذ أوامر تحكّم',
        description: 'القبول يعني «أُرسل للشركة» لا «نفّذه الجهاز».',
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        params: DeviceParams,
        body: Type.Ref(CommandRequest),
        response: { 200: Type.Ref(CommandResult), ...COMMON_ERRORS },
      },
    },
    async (request) =>
      devices.execute(request.user.sub, request.params.id, request.body.commands),
  );

  app.get(
    '/devices/:id/history',
    {
      onRequest: [app.authenticate],
      schema: {
        summary: 'سجلّ قراءات الجهاز',
        description: 'من قاعدتنا أولاً، ومن الشركة حتى يمتلئ سجلّنا — المصدر مُصرَّح به.',
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        params: DeviceParams,
        querystring: HistoryQuery,
        response: { 200: Type.Ref(HistoryResponse), ...COMMON_ERRORS },
      },
    },
    async (request) => {
      const { keys, start, end, limit } = request.query;
      const endAt = end ? new Date(end) : new Date();
      const startAt = start ? new Date(start) : new Date(endAt.getTime() - DAY_MS);

      return devices.history(request.user.sub, request.params.id, {
        keys: keys ? keys.split(',').map((key) => key.trim()).filter(Boolean) : [],
        start: startAt,
        end: endAt,
        limit: limit ?? 100,
      });
    },
  );
};
