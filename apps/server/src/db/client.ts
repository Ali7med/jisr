import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * عميل Prisma بمحوّل Postgres صريح (Prisma 7). يُنشأ مرة واحدة عند الإقلاع
 * ويُغلق مع إيقاف السيرفر بهدوء.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
