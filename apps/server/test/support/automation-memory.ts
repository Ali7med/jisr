import { randomUUID } from 'node:crypto';
import type {
  AutomationRecord,
  AutomationRepository,
  AutomationRunRecord,
  NotificationRecord,
  NotificationRepository,
  SceneRecord,
  SceneRepository,
} from '../../src/db/repositories.ts';

/** مستودعات الأتمتة في الذاكرة — تجعل اختبار المحرّك ممكناً بلا Postgres. */
export function createAutomationMemory() {
  const automations = new Map<string, AutomationRecord>();
  const runs = new Map<string, AutomationRunRecord[]>();
  const scenes = new Map<string, SceneRecord>();
  const notifications = new Map<string, NotificationRecord>();

  const automationRepository: AutomationRepository = {
    async listByUser(userId) {
      return [...automations.values()].filter((row) => row.userId === userId);
    },
    async listEnabled() {
      return [...automations.values()].filter((row) => row.enabled);
    },
    async findOwned(userId, id) {
      const row = automations.get(id);
      return row && row.userId === userId ? row : null;
    },
    async create(userId, input) {
      const record: AutomationRecord = {
        id: randomUUID(),
        userId,
        ...input,
        lastRunAt: null,
        createdAt: new Date(),
      };
      automations.set(record.id, record);
      return record;
    },
    async update(id, input) {
      const current = automations.get(id);
      if (!current) throw new Error(`أتمتة غير موجودة: ${id}`);
      const updated: AutomationRecord = { ...current, ...input };
      automations.set(id, updated);
      return updated;
    },
    async remove(id) {
      automations.delete(id);
    },
    async markRun(id, ranAt) {
      const current = automations.get(id);
      if (current) automations.set(id, { ...current, lastRunAt: ranAt });
    },
    async recordRun(id, run) {
      runs.set(id, [...(runs.get(id) ?? []), run]);
    },
    async listRuns(id, limit) {
      return [...(runs.get(id) ?? [])].reverse().slice(0, limit);
    },
  };

  const sceneRepository: SceneRepository = {
    async listByUser(userId) {
      return [...scenes.values()].filter((row) => row.userId === userId);
    },
    async findOwned(userId, id) {
      const row = scenes.get(id);
      return row && row.userId === userId ? row : null;
    },
    async findById(id) {
      return scenes.get(id) ?? null;
    },
    async create(userId, input) {
      const record: SceneRecord = { id: randomUUID(), userId, ...input, createdAt: new Date() };
      scenes.set(record.id, record);
      return record;
    },
    async remove(id) {
      scenes.delete(id);
    },
  };

  const notificationRepository: NotificationRepository = {
    async listByUser(userId, limit) {
      return [...notifications.values()]
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async create(input) {
      const record: NotificationRecord = {
        id: randomUUID(),
        ...input,
        readAt: null,
        createdAt: new Date(),
      };
      notifications.set(record.id, record);
      return record;
    },
    async markAllRead(userId, at) {
      for (const [id, row] of notifications) {
        if (row.userId === userId && row.readAt === null) {
          notifications.set(id, { ...row, readAt: at });
        }
      }
    },
  };

  return { automationRepository, sceneRepository, notificationRepository };
}
