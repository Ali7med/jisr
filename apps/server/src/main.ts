import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPrismaClient } from './db/client.ts';
import { createPrismaRepositories } from './db/prisma-repositories.ts';

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);
const app = await buildApp(config, { repositories: createPrismaRepositories(prisma) });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} — إيقاف السيرفر بهدوء`);
    void app
      .close()
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error, 'تعذّر إقلاع السيرفر');
  process.exit(1);
}
