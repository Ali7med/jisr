import type { PrismaClient } from '@prisma/client';
import type { AccountStatus, Capability } from '@jisr/shared';
import {
  createAutomationRepository,
  createNotificationRepository,
  createSceneRepository,
} from './automation-repositories.ts';
import {
  createActivityRepository,
  createInvitationRepository,
  createMembershipRepository,
} from './household-repositories.ts';
import type {
  AccountRecord,
  Bytes,
  AccountRepository,
  DeviceRecord,
  DeviceRepository,
  StateHistoryRepository,
  SyncOutcome,
  Repositories,
  RefreshTokenRecord,
  RefreshTokenRepository,
  UserRecord,
  UserRepository,
} from './repositories.ts';

/** البريد يُخزَّن ويُطابَق بحروف صغيرة — «Ali@x.com» و«ali@x.com» حساب واحد. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}

export function createPrismaRepositories(prisma: PrismaClient): Repositories {
  const users: UserRepository = {
    async findByEmail(email) {
      const row = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
      return row ? toUser(row) : null;
    },
    async findById(id) {
      const row = await prisma.user.findUnique({ where: { id } });
      return row ? toUser(row) : null;
    },
    async create(input) {
      const row = await prisma.user.create({
        data: {
          email: normalizeEmail(input.email),
          passwordHash: input.passwordHash,
          displayName: input.displayName,
        },
      });
      return toUser(row);
    },
  };

  const refreshTokens: RefreshTokenRepository = {
    async create(input) {
      await prisma.refreshToken.create({ data: input });
    },
    async findValidByHash(tokenHash, now): Promise<RefreshTokenRecord | null> {
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (!row || row.revokedAt !== null || row.expiresAt <= now) return null;
      return {
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      };
    },
    async revokeByHash(tokenHash, now) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: now },
      });
    },
    async revokeAllForUser(userId, now) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    },
  };

  return {
    async ping() {
      await prisma.$queryRaw`SELECT 1`;
    },
    users,
    refreshTokens,
    accounts: createAccountRepository(prisma),
    automations: createAutomationRepository(prisma),
    scenes: createSceneRepository(prisma),
    notifications: createNotificationRepository(prisma),
    memberships: createMembershipRepository(prisma),
    invitations: createInvitationRepository(prisma),
    activity: createActivityRepository(prisma),
    devices: createDeviceRepository(prisma),
    history: createHistoryRepository(prisma),
  };
}

// ── الحسابات ────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string;
  userId: string;
  integrationId: string;
  label: string;
  status: string;
  secretsCipher: Bytes;
  secretsIv: Bytes;
  secretsTag: Bytes;
  keyVersion: number;
  credentialsExpireAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
}

function toAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    userId: row.userId,
    integrationId: row.integrationId,
    label: row.label,
    status: row.status as AccountStatus,
    secretsCipher: row.secretsCipher,
    secretsIv: row.secretsIv,
    secretsTag: row.secretsTag,
    keyVersion: row.keyVersion,
    credentialsExpireAt: row.credentialsExpireAt,
    lastCheckedAt: row.lastCheckedAt,
    createdAt: row.createdAt,
  };
}

function createAccountRepository(prisma: PrismaClient): AccountRepository {
  return {
    async listByUser(userId) {
      const rows = await prisma.account.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toAccount);
    },

    async listActive() {
      const rows = await prisma.account.findMany({ where: { status: 'active' } });
      return rows.map(toAccount);
    },

    async findOwned(userId, accountId) {
      const row = await prisma.account.findFirst({ where: { id: accountId, userId } });
      return row ? toAccount(row) : null;
    },

    async create(input) {
      return toAccount(await prisma.account.create({ data: { ...input, status: 'active' } }));
    },

    async update(accountId, patch) {
      return toAccount(await prisma.account.update({ where: { id: accountId }, data: patch }));
    },

    async remove(accountId) {
      await prisma.account.delete({ where: { id: accountId } });
    },

    async countDevices(accountIds) {
      if (accountIds.length === 0) return new Map();
      const groups = await prisma.device.groupBy({
        by: ['accountId'],
        where: { accountId: { in: [...accountIds] } },
        _count: { _all: true },
      });
      return new Map(groups.map((group) => [group.accountId, group._count._all]));
    },
  };
}

// ── الأجهزة ─────────────────────────────────────────────────────────────────

interface DeviceRow {
  id: string;
  accountId: string;
  integrationId: string;
  nativeId: string;
  name: string;
  category: string;
  online: boolean;
  model: string;
  productName: string;
  iconUrl: string | null;
  room: string | null;
  isSubDevice: boolean;
  capabilities: unknown;
  lastSeenAt: Date | null;
}

function toDevice(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    integrationId: row.integrationId,
    nativeId: row.nativeId,
    name: row.name,
    category: row.category,
    online: row.online,
    model: row.model,
    productName: row.productName,
    iconUrl: row.iconUrl,
    room: row.room,
    isSubDevice: row.isSubDevice,
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as Capability[]) : [],
    lastSeenAt: row.lastSeenAt,
  };
}

function createDeviceRepository(prisma: PrismaClient): DeviceRepository {
  return {
    async listVisible(userId) {
      const rows = await prisma.device.findMany({
        where: {
          OR: [
            { account: { userId } },
            // مساحات الآخرين: لا يظهر إلا ما مُنح إذناً عليه صراحةً
            { permissions: { some: { membership: { memberId: userId } } } },
          ],
        },
        orderBy: [{ name: 'asc' }],
      });
      return rows.map(toDevice);
    },

    async listByAccount(accountId) {
      const rows = await prisma.device.findMany({ where: { accountId }, orderBy: { name: 'asc' } });
      return rows.map(toDevice);
    },

    async findVisible(userId, integrationId, nativeId) {
      const row = await prisma.device.findFirst({
        where: {
          integrationId,
          nativeId,
          OR: [
            { account: { userId } },
            { permissions: { some: { membership: { memberId: userId } } } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          account: true,
          permissions: { where: { membership: { memberId: userId } }, take: 1 },
        },
      });
      if (!row) return null;

      const { account, permissions, ...device } = row;
      const isOwner = account.userId === userId;

      return {
        device: toDevice(device),
        account: toAccount(account),
        ownerId: account.userId,
        isOwner,
        // المالك يتحكّم دائماً؛ العضو بقدر إذنه لا أكثر
        canControl: isOwner || (permissions[0]?.canControl ?? false),
      };
    },

    async replaceForAccount(accountId, devices): Promise<SyncOutcome> {
      const existing = await prisma.device.findMany({
        where: { accountId },
        select: { nativeId: true },
      });
      const known = new Set(existing.map((row) => row.nativeId));
      const incoming = new Set(devices.map((device) => device.nativeId));
      const removed = existing.filter((row) => !incoming.has(row.nativeId)).length;
      const added = devices.filter((device) => !known.has(device.nativeId)).length;
      const now = new Date();

      await prisma.$transaction([
        ...devices.map((device) =>
          prisma.device.upsert({
            where: { accountId_nativeId: { accountId, nativeId: device.nativeId } },
            // القدرات لا تُلمس هنا: تُجلب كسولاً عند فتح الجهاز توفيراً
            // لحصّة استدعاءات الشركة (الدراسة § 7)
            create: { ...device, accountId, lastSeenAt: now, capabilities: [] },
            update: { ...device, lastSeenAt: now },
          }),
        ),
        prisma.device.deleteMany({
          where: { accountId, nativeId: { notIn: devices.map((device) => device.nativeId) } },
        }),
      ]);

      return { total: devices.length, added, removed };
    },

    async saveCapabilities(deviceId, capabilities) {
      await prisma.device.update({
        where: { id: deviceId },
        data: { capabilities: [...capabilities] },
      });
    },
  };
}

// ── السجلّ ──────────────────────────────────────────────────────────────────

function createHistoryRepository(prisma: PrismaClient): StateHistoryRepository {
  return {
    async list(query) {
      const rows = await prisma.stateHistory.findMany({
        where: {
          deviceId: query.deviceId,
          recordedAt: { gte: query.start, lte: query.end },
          value: { not: null },
          ...(query.keys.length > 0 ? { key: { in: [...query.keys] } } : {}),
        },
        orderBy: { recordedAt: 'asc' },
        take: query.limit,
      });
      return rows.map((row) => ({
        key: row.key,
        value: row.value ?? 0,
        recordedAt: row.recordedAt,
      }));
    },

    async record(rows) {
      if (rows.length === 0) return;
      await prisma.stateHistory.createMany({
        data: rows.map((row) => ({
          deviceId: row.deviceId,
          key: row.key,
          value: row.value,
          rawValue: row.rawValue === null || row.rawValue === undefined ? undefined : row.rawValue,
          recordedAt: row.recordedAt,
        })),
      });
    },

    async prune(olderThan) {
      const result = await prisma.stateHistory.deleteMany({
        where: { recordedAt: { lt: olderThan } },
      });
      return result.count;
    },
  };
}
