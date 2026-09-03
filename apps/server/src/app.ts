import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import websocket from '@fastify/websocket';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AcceptInvitationRequest,
  Account,
  AccountList,
  AccountStatus,
  ActivityEntry,
  ActivityList,
  ApiError,
  Automation,
  AutomationAction,
  AutomationCondition,
  AutomationInput,
  AutomationList,
  AutomationRun,
  AutomationRunList,
  AutomationTrigger,
  AuthSession,
  AuthTokens,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  UserProfile,
  Capability,
  CapabilityKind,
  CommandAction,
  CommandRequest,
  CompareOp,
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
  DeviceEvent,
  HealthResponse,
  HelloEvent,
  HistoryPoint,
  HistoryResponse,
  HistorySource,
  DevicePermission,
  IntegrationInfo,
  IntegrationList,
  Invitation,
  InvitationInput,
  InvitationList,
  Member,
  MemberList,
  MemberRole,
  Notification,
  NotificationEvent,
  NotificationList,
  NotifyAction,
  NotifySeverity,
  RealtimeAuthMessage,
  RealtimeEvent,
  PermissionsInput,
  Scene,
  SceneAction,
  SceneInput,
  SceneList,
  SceneRunResult,
  SceneStep,
  ScheduleTrigger,
  StateCondition,
  StateEvent,
  StateTrigger,
  StateValue,
  SyncResult,
  TimeCondition,
  UpdateAccountRequest,
} from '@jisr/shared';
import type { Config } from './config.ts';
import { registerErrorHandlers } from './errors.ts';
import { jwtPlugin } from './auth/jwt.ts';
import { createAuthService } from './auth/service.ts';
import { createSecretsCipher } from './db/crypto.ts';
import type { Repositories } from './db/repositories.ts';
import { createAccountsService, type AccountsService } from './accounts/service.ts';
import { createDevicesService } from './devices/service.ts';
import { createIntegrationOpener } from './integrations/opener.ts';
import { createIntegrationRegistry, type IntegrationRegistry } from './integrations/registry.ts';
import { createStateBus, type StateBus } from './state/bus.ts';
import { createStatePipeline, type StatePipeline } from './state/pipeline.ts';
import { createAutomationEngine, type AutomationEngine } from './automation/engine.ts';
import { createNotifier } from './automation/notifier.ts';
import { createScenesService } from './automation/scenes.ts';
import {
  createAutomationsService,
  createNotificationsService,
} from './automation/service.ts';
import { createHouseholdService } from './household/service.ts';
import { accountRoutes } from './routes/accounts.ts';
import { householdRoutes } from './routes/household.ts';
import { automationRoutes } from './routes/automations.ts';
import { sceneRoutes } from './routes/scenes.ts';
import { authRoutes } from './routes/auth.ts';
import { deviceRoutes } from './routes/devices.ts';
import { healthRoutes } from './routes/health.ts';
import { realtimeRoutes } from './routes/realtime.ts';
import type { IntegrationOpener } from './integrations/opener.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** قناة الأحداث اللحظية — تقرأها المهامّ الخلفية في `main.ts`. */
    bus: StateBus;
    statePipeline: StatePipeline;
    integrationOpener: IntegrationOpener;
    accountsService: AccountsService;
    automationEngine: AutomationEngine;
  }
}

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
  HelloEvent,
  StateEvent,
  DeviceEvent,
  NotifySeverity,
  Notification,
  NotificationEvent,
  NotificationList,
  RealtimeEvent,
  RealtimeAuthMessage,
  CompareOp,
  StateTrigger,
  ScheduleTrigger,
  AutomationTrigger,
  TimeCondition,
  StateCondition,
  AutomationCondition,
  CommandAction,
  SceneAction,
  NotifyAction,
  AutomationAction,
  Automation,
  AutomationInput,
  AutomationList,
  AutomationRun,
  AutomationRunList,
  SceneStep,
  Scene,
  SceneInput,
  SceneList,
  SceneRunResult,
  MemberRole,
  DevicePermission,
  Member,
  MemberList,
  PermissionsInput,
  InvitationInput,
  Invitation,
  InvitationList,
  AcceptInvitationRequest,
  ActivityEntry,
  ActivityList,
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

  const bus = createStateBus();
  const notifier = createNotifier(deps.repositories, bus);
  const scenes = createScenesService({ repositories: deps.repositories, devices });
  const automations = createAutomationsService(deps.repositories);
  const household = createHouseholdService({ repositories: deps.repositories });
  const notifications = createNotificationsService(deps.repositories);

  const engine = createAutomationEngine({
    repositories: deps.repositories,
    devices,
    scenes,
    notifier,
    log: app.log,
  });

  app.decorate('bus', bus);
  app.decorate(
    'statePipeline',
    createStatePipeline({
      repositories: deps.repositories,
      bus,
      // كل قراءة متغيّرة تمرّ بالمحرّك فوراً — لا طابور بين الحدث والإجراء
      // (ADR-0015). خطأ في أتمتة لا يُسقط حفظ القراءة ولا نشرها.
      onChange: (update) => {
        void engine
          .onStateChange(update)
          .catch((error: unknown) => app.log.error({ err: error }, 'فشل تقييم أتمتة'));
      },
    }),
  );
  app.decorate('automationEngine', engine);
  app.decorate('integrationOpener', opener);
  app.decorate('accountsService', accounts);

  await app.register(websocket);

  await app.register(healthRoutes, { config, repositories: deps.repositories });
  await app.register(authRoutes, { auth });
  await app.register(accountRoutes, { accounts });
  await app.register(deviceRoutes, { devices });
  await app.register(realtimeRoutes, { bus });
  await app.register(automationRoutes, { automations });
  await app.register(sceneRoutes, { scenes, notifications });
  await app.register(householdRoutes, { household });

  return app;
}
