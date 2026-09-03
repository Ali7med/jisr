import { randomUUID } from 'node:crypto';
import type {
  Repositories,
  RefreshTokenRecord,
  UserRecord,
} from '../../src/db/repositories.ts';

/**
 * مستودعات في الذاكرة — تجعل اختبارات المصادقة تعمل بلا Postgres.
 * سلوكها يطابق نظيرها في Prisma: البريد بحروف صغيرة، والرمز المُبطَل
 * أو المنتهي لا يُعتبر صالحاً.
 */
export function createMemoryRepositories(): Repositories {
  const users = new Map<string, UserRecord>();
  const tokens = new Map<string, RefreshTokenRecord>();

  return {
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
  };
}
