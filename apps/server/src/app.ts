import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiError,
  Capability,
  CapabilityKind,
  CredentialField,
  CredentialFieldType,
  CredentialOption,
  Command,
  Device,
  DeviceCategory,
  HealthResponse,
  HistoryPoint,
  IntegrationInfo,
  StateValue,
} from '@jisr/shared';
import type { Config } from './config.ts';
import { registerErrorHandlers } from './errors.ts';
import { healthRoutes } from './routes/health.ts';

/**
 * مخطّطات العقد المشترك تُسجَّل مرة واحدة، فتُشير إليها المسارات بـ `$ref`
 * وتظهر في OpenAPI تحت `components.schemas` — [ADR-0010].
 */
const SHARED_SCHEMAS = [
  ApiError,
  CapabilityKind,
  Capability,
  DeviceCategory,
  Device,
  StateValue,
  Command,
  HistoryPoint,
  CredentialFieldType,
  CredentialOption,
  CredentialField,
  IntegrationInfo,
  HealthResponse,
];

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    // السجلّات لا تطبع أسراراً أبداً (الهيكلية § 7)
    logger: { level: config.logLevel },
  }).withTypeProvider<TypeBoxTypeProvider>();

  for (const schema of SHARED_SCHEMAS) {
    app.addSchema(schema);
  }

  // حدّ عام على كل المسارات — سقف أشدّ على /auth يُضاف مع P1.2
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Jisr API',
        description: 'عقد واجهة جسر — مصدر الحقيقة الوحيد للسيرفر والويب والهاتف (ADR-0010)',
        version: config.version,
      },
      servers: [{ url: '/', description: 'السيرفر الحالي' }],
    },
    // أسماء المخططات في العقد هي `$id` نفسها — لا `def-0`؛ العقد يُقرأ
    // بشرياً وتُبنى عليه fixtures الهاتف الذهبية (ADR-0010)
    refResolver: {
      buildLocalReference: (json, _baseUri, fragment, i) =>
        typeof json['$id'] === 'string' ? json['$id'] : `${fragment}-${i}`,
    },
  });

  registerErrorHandlers(app);

  await app.register(healthRoutes, { config });

  return app;
}
