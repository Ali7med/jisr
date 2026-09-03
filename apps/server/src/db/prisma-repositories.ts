import type { PrismaClient } from '@prisma/client';
import type {
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

  return { users, refreshTokens };
}
