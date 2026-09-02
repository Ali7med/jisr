import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { HealthResponse } from '@jisr/shared';
import type { Config } from '../config.ts';

/**
 * `/health` — تقرؤه المراقبة والنشر. لا مصادقة عليه، ولا يكشف أي تفصيل
 * داخلي: مجرد إشارة حياة وإصدار ([الهيكلية § 8] · [ADR-0014]).
 */
export const healthRoutes: FastifyPluginAsyncTypebox<{ config: Config }> = async (app, opts) => {
  const startedAt = Date.now();

  app.get(
    '/health',
    {
      schema: {
        summary: 'فحص حياة السيرفر',
        tags: ['system'],
        response: {
          200: Type.Ref('HealthResponse'),
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      version: opts.config.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      at: new Date().toISOString(),
    }),
  );
};
