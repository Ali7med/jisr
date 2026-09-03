import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  NotifySeverity,
  SceneStep,
} from '@jisr/shared';
import type {
  AutomationRecord,
  AutomationRepository,
  NotificationRecord,
  NotificationRepository,
  SceneRecord,
  SceneRepository,
} from './repositories.ts';

/**
 * الأشكال تُخزَّن Json: العقد (TypeBox) هو من يتحقّق منها عند الدخول،
 * فالقاعدة تحفظها كما هي بلا هجرة لكل حقل جديد في مُشغِّل أو إجراء.
 */
/**
 * العقد (TypeBox) تحقّق من الشكل قبل الوصول إلى هنا؛ Prisma يطلب نوعه
 * الخاص لأعمدة Json. التحويل صريح ومحصور في هذا الملف.
 */
function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface AutomationRow {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  lastRunAt: Date | null;
  createdAt: Date;
}

function toAutomation(row: AutomationRow): AutomationRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    enabled: row.enabled,
    trigger: row.trigger as AutomationTrigger,
    conditions: Array.isArray(row.conditions) ? (row.conditions as AutomationCondition[]) : [],
    actions: Array.isArray(row.actions) ? (row.actions as AutomationAction[]) : [],
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
  };
}

export function createAutomationRepository(prisma: PrismaClient): AutomationRepository {
  return {
    async listByUser(userId) {
      const rows = await prisma.automation.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toAutomation);
    },

    async listEnabled() {
      const rows = await prisma.automation.findMany({ where: { enabled: true } });
      return rows.map(toAutomation);
    },

    async findOwned(userId, id) {
      const row = await prisma.automation.findFirst({ where: { id, userId } });
      return row ? toAutomation(row) : null;
    },

    async create(userId, input) {
      return toAutomation(
        await prisma.automation.create({
          data: {
            userId,
            name: input.name,
            enabled: input.enabled,
            trigger: asJson(input.trigger),
            conditions: asJson(input.conditions),
            actions: asJson(input.actions),
          },
        }),
      );
    },

    async update(id, input) {
      return toAutomation(
        await prisma.automation.update({
          where: { id },
          data: {
            name: input.name,
            enabled: input.enabled,
            trigger: asJson(input.trigger),
            conditions: asJson(input.conditions),
            actions: asJson(input.actions),
          },
        }),
      );
    },

    async remove(id) {
      await prisma.automation.delete({ where: { id } });
    },

    async markRun(id, ranAt) {
      await prisma.automation.update({ where: { id }, data: { lastRunAt: ranAt } });
    },

    async recordRun(id, run) {
      await prisma.automationRun.create({
        data: {
          automationId: id,
          succeeded: run.succeeded,
          detail: run.detail,
          ranAt: run.ranAt,
        },
      });
    },

    async listRuns(id, limit) {
      const rows = await prisma.automationRun.findMany({
        where: { automationId: id },
        orderBy: { ranAt: 'desc' },
        take: limit,
      });
      return rows.map((row) => ({
        succeeded: row.succeeded,
        detail: row.detail,
        ranAt: row.ranAt,
      }));
    },
  };
}

function toScene(row: {
  id: string;
  userId: string;
  name: string;
  icon: string;
  steps: unknown;
  createdAt: Date;
}): SceneRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    icon: row.icon,
    steps: Array.isArray(row.steps) ? (row.steps as SceneStep[]) : [],
    createdAt: row.createdAt,
  };
}

export function createSceneRepository(prisma: PrismaClient): SceneRepository {
  return {
    async listByUser(userId) {
      const rows = await prisma.scene.findMany({ where: { userId }, orderBy: { name: 'asc' } });
      return rows.map(toScene);
    },
    async findOwned(userId, id) {
      const row = await prisma.scene.findFirst({ where: { id, userId } });
      return row ? toScene(row) : null;
    },
    async findById(id) {
      const row = await prisma.scene.findUnique({ where: { id } });
      return row ? toScene(row) : null;
    },
    async create(userId, input) {
      return toScene(
        await prisma.scene.create({
          data: { userId, name: input.name, icon: input.icon, steps: asJson(input.steps) },
        }),
      );
    },
    async remove(id) {
      await prisma.scene.delete({ where: { id } });
    },
  };
}

function toNotification(row: {
  id: string;
  userId: string;
  title: string;
  body: string;
  severity: string;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body,
    severity: row.severity as NotifySeverity,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function createNotificationRepository(prisma: PrismaClient): NotificationRepository {
  return {
    async listByUser(userId, limit) {
      const rows = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map(toNotification);
    },
    async create(input) {
      return toNotification(await prisma.notification.create({ data: input }));
    },
    async markAllRead(userId, at) {
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: at },
      });
    },
  };
}
