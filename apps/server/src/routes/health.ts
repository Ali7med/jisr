import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { HealthResponse, ApiError } from '@jisr/shared';
import type { Config } from '../config.ts';
import type { Repositories } from '../db/repositories.ts';

/**
 * `/health` — تقرؤه المراقبة والنشر. لا مصادقة عليه، ولا يكشف أي تفصيل
 * داخلي: مجرد إشارة حياة وإصدار ([الهيكلية § 8] · [ADR-0014]).
 */
export const healthRoutes: FastifyPluginAsyncTypebox<{
  config: Config;
  repositories: Repositories;
}> = async (app, opts) => {
  const startedAt = Date.now();

  app.get(
    '/health',
    {
      schema: {
        summary: 'فحص حياة السيرفر',
        tags: ['system'],
        response: {
          200: Type.Ref(HealthResponse),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      version: opts.config.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      at: new Date().toISOString(),
    }),
  );

  /**
   * الجاهزية ≠ الحياة: السيرفر قد يستجيب وقاعدته غير قابلة للوصول.
   * الموازِن يسحب النسخة من الخدمة عند 503 بدل أن يرسل لها طلبات تفشل
   * ([ADR-0014] — قياس التوفّر يعتمد على هذا التمييز).
   */
  app.get(
    '/health/ready',
    {
      schema: {
        summary: 'جاهزية السيرفر لاستقبال الطلبات (يفحص قاعدة البيانات)',
        tags: ['system'],
        response: {
          200: Type.Ref(HealthResponse),
          503: Type.Ref(ApiError),
        },
      },
    },
    async (request, reply) => {
      try {
        await opts.repositories.ping();
      } catch (error) {
        request.log.error({ err: error }, 'فحص الجاهزية فشل: قاعدة البيانات لا تستجيب');
        return reply.code(503).send({
          code: 'NOT_READY',
          message: 'الخدمة غير جاهزة حالياً — قاعدة البيانات لا تستجيب. جارٍ العمل على ذلك.',
        });
      }

      return {
        status: 'ok' as const,
        version: opts.config.version,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        at: new Date().toISOString(),
      };
    },
  );
};
