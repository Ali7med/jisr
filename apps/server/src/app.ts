import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  Account,
  AccountList,
  AccountStatus,
  ApiError,
  AuthSession,
  AuthTokens,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  UserProfile,
  Capability,
  CapabilityKind,
  CommandRequest,
  CommandResult,
  CreateAccountRequest,
  Credentials,
  CredentialField,
  CredentialFieldType,
  CredentialOption,
  Command,
  Device,
  DeviceCategory,
  DeviceList,
  DeviceSnapshot,
  HealthResponse,
  HistoryPoint,
  HistoryResponse,
  HistorySource,
  IntegrationInfo,
  IntegrationList,
  StateValue,
  SyncResult,
  UpdateAccountRequest,
} from '@jisr/shared';
import type { Config } from './config.ts';
import { registerErrorHandlers } from './errors.ts';
import { jwtPlugin } from './auth/jwt.ts';
import { createAuthService } from './auth/service.ts';
import { createSecretsCipher } from './db/crypto.ts';
import type { Repositories } from './db/repositories.ts';
import { createAccountsService } from './accounts/service.ts';
import { createDevicesService } from './devices/service.ts';
import { createIntegrationOpener } from './integrations/opener.ts';
import { createIntegrationRegistry, type IntegrationRegistry } from './integrations/registry.ts';
import { accountRoutes } from './routes/accounts.ts';
import { authRoutes } from './routes/auth.ts';
import { deviceRoutes } from './routes/devices.ts';
import { healthRoutes } from './routes/health.ts';

/**
 * مخطّطات العقد المشترك تُسجَّل مرة واحدة، فتُشير إليها المسارات بـ `$ref`
 * وتظهر في OpenAPI تحت `components.schemas` — [ADR-0010].
 */
const SHARED_SCHEMAS = [
  ApiError,
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
  UserProfile,
  AuthTokens,
  AuthSession,
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
  IntegrationList,
  AccountStatus,
  Account,
  Credentials,
  CreateAccountRequest,
  UpdateAccountRequest,
  AccountList,
  SyncResult,
  DeviceList,
  DeviceSnapshot,
  CommandRequest,
  CommandResult,
  HistorySource,
  HistoryResponse,
  HealthResponse,
];

export interface AppDependencies {
  /** المستودعات تُمرَّر من الخارج: الاختبارات تستخدم نسخة في الذاكرة. */
  readonly repositories: Repositories;
  /** سجلّ التكاملات يُحقن كذلك: الاختبارات تستبدله بتكامل وهمي بلا شبكة. */
  readonly registry?: IntegrationRegistry;
}

export async function buildApp(
  config: Config,
  deps: AppDependencies,
): Promise<FastifyInstance> {
  const app = Fastify({
    // السجلّات لا تطبع أسراراً أبداً (الهيكلية § 7)
    logger: { level: config.logLevel },
  }).withTypeProvider<TypeBoxTypeProvider>();

  for (const schema of SHARED_SCHEMAS) {
    app.addSchema(schema);
  }

  // حدّ عام على كل المسارات — سقف أشدّ على /auth مضبوط على مستوى مساراته
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
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    // أسماء المخططات في العقد هي `$id` نفسها — لا `def-0`؛ العقد يُقرأ
    // بشرياً وتُبنى عليه fixtures الهاتف الذهبية (ADR-0010)
    refResolver: {
      buildLocalReference: (json, _baseUri, fragment, i) =>
        typeof json['$id'] === 'string' ? json['$id'] : `${fragment}-${i}`,
    },
  });

  registerErrorHandlers(app);

  await app.register(jwtPlugin, {
    secret: config.jwtSecret,
    expiresInSeconds: config.accessTokenTtlSeconds,
  });

  const auth = createAuthService({
    repositories: deps.repositories,
    issuer: { sign: (payload) => app.jwt.sign(payload) },
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlDays: config.refreshTokenTtlDays,
  });

  const registry = deps.registry ?? createIntegrationRegistry();
  const cipher = createSecretsCipher(config.secretsKeys, config.secretsKeyVersion);
  const opener = createIntegrationOpener(registry, cipher);
  const accounts = createAccountsService({
    repositories: deps.repositories,
    registry,
    opener,
    cipher,
  });
  const devices = createDevicesService({ repositories: deps.repositories, registry, opener });

  await app.register(healthRoutes, { config });
  await app.register(authRoutes, { auth });
  await app.register(accountRoutes, { accounts });
  await app.register(deviceRoutes, { devices });

  return app;
}
