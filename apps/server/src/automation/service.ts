import type {
  Automation,
  AutomationInput,
  AutomationRun,
  Notification,
  NotificationList,
} from '@jisr/shared';
import type { AutomationRecord, Repositories } from '../db/repositories.ts';
import { ApiFailure } from '../errors.ts';
import { toNotification } from './notifier.ts';

const NOT_FOUND = 'لم نعثر على هذه الأتمتة — قد تكون حُذفت. حدّث القائمة.';

function toAutomation(record: AutomationRecord): Automation {
  return {
    id: record.id,
    name: record.name,
    enabled: record.enabled,
    trigger: record.trigger,
    conditions: record.conditions,
    actions: record.actions,
    ...(record.lastRunAt ? { lastRunAt: record.lastRunAt.toISOString() } : {}),
    createdAt: record.createdAt.toISOString(),
  };
}

export interface AutomationsService {
  list(userId: string): Promise<Automation[]>;
  create(userId: string, input: AutomationInput): Promise<Automation>;
  update(userId: string, id: string, input: AutomationInput): Promise<Automation>;
  remove(userId: string, id: string): Promise<void>;
  /** سجلّ التنفيذ — يجعل «لماذا لم تعمل أتمتتي؟» سؤالاً له جواب. */
  runs(userId: string, id: string, limit: number): Promise<AutomationRun[]>;
}

export function createAutomationsService(repositories: Repositories): AutomationsService {
  async function owned(userId: string, id: string): Promise<AutomationRecord> {
    const record = await repositories.automations.findOwned(userId, id);
    if (!record) throw ApiFailure.notFound(NOT_FOUND);
    return record;
  }

  return {
    async list(userId) {
      return (await repositories.automations.listByUser(userId)).map(toAutomation);
    },

    async create(userId, input) {
      return toAutomation(
        await repositories.automations.create(userId, { ...input, name: input.name.trim() }),
      );
    },

    async update(userId, id, input) {
      await owned(userId, id);
      return toAutomation(
        await repositories.automations.update(id, { ...input, name: input.name.trim() }),
      );
    },

    async remove(userId, id) {
      await owned(userId, id);
      await repositories.automations.remove(id);
    },

    async runs(userId, id, limit) {
      await owned(userId, id);
      const rows = await repositories.automations.listRuns(id, limit);
      return rows.map((row) => ({
        succeeded: row.succeeded,
        detail: row.detail,
        ranAt: row.ranAt.toISOString(),
      }));
    },
  };
}

export interface NotificationsService {
  list(userId: string, limit: number): Promise<NotificationList>;
  markAllRead(userId: string): Promise<void>;
}

export function createNotificationsService(
  repositories: Repositories,
  now: () => Date = () => new Date(),
): NotificationsService {
  return {
    async list(userId, limit) {
      const rows = await repositories.notifications.listByUser(userId, limit);
      const notifications: Notification[] = rows.map(toNotification);
      return {
        notifications,
        unread: notifications.filter((notification) => !notification.read).length,
      };
    },

    async markAllRead(userId) {
      await repositories.notifications.markAllRead(userId, now());
    },
  };
}
