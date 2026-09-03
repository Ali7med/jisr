import { randomUUID } from 'node:crypto';
import type {
  AccountRecord,
  DeviceRecord,
  HistoryRow,
  Repositories,
  RefreshTokenRecord,
  UserRecord,
} from '../../src/db/repositories.ts';
import { createAutomationMemory } from './automation-memory.ts';

/** يسمح للاختبارات بزرع سجلّ قراءات بلا Postgres. */
export interface MemoryRepositories extends Repositories {
  seedHistory(deviceId: string, rows: readonly HistoryRow[]): void;
}

/**
 * مستودعات في الذاكرة — تجعل اختبارات المصادقة تعمل بلا Postgres.
 * سلوكها يطابق نظيرها في Prisma: البريد بحروف صغيرة، والرمز المُبطَل
 * أو المنتهي لا يُعتبر صالحاً.
 */
export function createMemoryRepositories(): MemoryRepositories {
  const users = new Map<string, UserRecord>();
  const tokens = new Map<string, RefreshTokenRecord>();
  const accounts = new Map<string, AccountRecord>();
  const devices = new Map<string, DeviceRecord>();
  const history = new Map<string, HistoryRow[]>();
  const automation = createAutomationMemory();

  return {
    async ping() {
      /* الذاكرة جاهزة دائماً */
    },
    users: {
      async findByEmail(email) {
        const normalized = email.trim().toLowerCase();
        return [...users.values()].find((u) => u.email === normalized) ?? null;
      },
      async findById(id) {
        return users.get(id) ?? null;
      },
      async create(input) {
        const user: UserRecord = {
          id: randomUUID(),
          email: input.email.trim().toLowerCase(),
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          createdAt: new Date(),
        };
        users.set(user.id, user);
        return user;
      },
    },
    refreshTokens: {
      async create(input) {
        tokens.set(input.tokenHash, {
          id: randomUUID(),
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          revokedAt: null,
        });
      },
      async findValidByHash(tokenHash, now) {
        const token = tokens.get(tokenHash);
        if (!token || token.revokedAt !== null || token.expiresAt <= now) return null;
        return token;
      },
      async revokeByHash(tokenHash, now) {
        const token = tokens.get(tokenHash);
        if (token && token.revokedAt === null) {
          tokens.set(tokenHash, { ...token, revokedAt: now });
        }
      },
      async revokeAllForUser(userId, now) {
        for (const [hash, token] of tokens) {
          if (token.userId === userId && token.revokedAt === null) {
            tokens.set(hash, { ...token, revokedAt: now });
          }
        }
      },
    },

    accounts: {
      async listByUser(userId) {
        return [...accounts.values()].filter((account) => account.userId === userId);
      },
      async listActive() {
        return [...accounts.values()].filter((account) => account.status === 'active');
      },
      async findOwned(userId, accountId) {
        const account = accounts.get(accountId);
        return account && account.userId === userId ? account : null;
      },
      async create(input) {
        const account: AccountRecord = {
          id: randomUUID(),
          userId: input.userId,
          integrationId: input.integrationId,
          label: input.label,
          status: 'active',
          secretsCipher: input.secretsCipher,
          secretsIv: input.secretsIv,
          secretsTag: input.secretsTag,
          keyVersion: input.keyVersion,
          credentialsExpireAt: null,
          lastCheckedAt: null,
          createdAt: new Date(),
        };
        accounts.set(account.id, account);
        return account;
      },
      async update(accountId, patch) {
        const current = accounts.get(accountId);
        if (!current) throw new Error(`حساب غير موجود: ${accountId}`);
        const updated: AccountRecord = { ...current, ...patch };
        accounts.set(accountId, updated);
        return updated;
      },
      async remove(accountId) {
        accounts.delete(accountId);
        for (const [id, device] of devices) {
          if (device.accountId === accountId) devices.delete(id);
        }
      },
      async countDevices(accountIds) {
        const counts = new Map<string, number>();
        for (const device of devices.values()) {
          if (accountIds.includes(device.accountId)) {
            counts.set(device.accountId, (counts.get(device.accountId) ?? 0) + 1);
          }
        }
        return counts;
      },
    },

    devices: {
      async listByUser(userId) {
        const owned = new Set(
          [...accounts.values()].filter((a) => a.userId === userId).map((a) => a.id),
        );
        return [...devices.values()].filter((device) => owned.has(device.accountId));
      },
      async listByAccount(accountId) {
        return [...devices.values()].filter((device) => device.accountId === accountId);
      },
      async findOwned(userId, integrationId, nativeId) {
        for (const device of devices.values()) {
          const account = accounts.get(device.accountId);
          if (
            account?.userId === userId &&
            device.integrationId === integrationId &&
            device.nativeId === nativeId
          ) {
            return { device, account };
          }
        }
        return null;
      },
      async replaceForAccount(accountId, incoming) {
        const existing = [...devices.values()].filter((device) => device.accountId === accountId);
        const known = new Set(existing.map((device) => device.nativeId));
        const arriving = new Set(incoming.map((device) => device.nativeId));

        for (const device of existing) {
          if (!arriving.has(device.nativeId)) devices.delete(device.id);
        }
        for (const input of incoming) {
          const current = existing.find((device) => device.nativeId === input.nativeId);
          const id = current?.id ?? randomUUID();
          devices.set(id, {
            id,
            accountId,
            capabilities: current?.capabilities ?? [],
            lastSeenAt: new Date(),
            ...input,
          });
        }

        return {
          total: incoming.length,
          added: incoming.filter((device) => !known.has(device.nativeId)).length,
          removed: existing.filter((device) => !arriving.has(device.nativeId)).length,
        };
      },
      async saveCapabilities(deviceId, capabilities) {
        const device = devices.get(deviceId);
        if (device) devices.set(deviceId, { ...device, capabilities: [...capabilities] });
      },
    },

    history: {
      async list(query) {
        return (history.get(query.deviceId) ?? [])
          .filter(
            (row) =>
              row.recordedAt >= query.start &&
              row.recordedAt <= query.end &&
              (query.keys.length === 0 || query.keys.includes(row.key)),
          )
          .slice(0, query.limit);
      },
      async record(rows) {
        for (const row of rows) {
          const current = history.get(row.deviceId) ?? [];
          current.push({ key: row.key, value: row.value ?? 0, recordedAt: row.recordedAt });
          history.set(row.deviceId, current);
        }
      },
      async prune(olderThan) {
        let removed = 0;
        for (const [deviceId, rows] of history) {
          const kept = rows.filter((row) => row.recordedAt >= olderThan);
          removed += rows.length - kept.length;
          history.set(deviceId, kept);
        }
        return removed;
      },
    },

    automations: automation.automationRepository,
    scenes: automation.sceneRepository,
    notifications: automation.notificationRepository,

    seedHistory(deviceId, rows) {
      history.set(deviceId, [...rows]);
    },
  };
}
