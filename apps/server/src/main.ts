import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPrismaClient } from './db/client.ts';
import { createPrismaRepositories } from './db/prisma-repositories.ts';
import { createStatePoller } from './state/poller.ts';
import { createRetentionJob } from './state/retention.ts';

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);
const repositories = createPrismaRepositories(prisma);
const app = await buildApp(config, { repositories });

/** مهامّ خلفية: تعيش مع السيرفر وتتوقّف معه. */
const poller = createStatePoller({
  repositories,
  opener: app.integrationOpener,
  pipeline: app.statePipeline,
  intervalMs: config.statePollIntervalMs,
  log: app.log,
});
const retention = createRetentionJob({
  repositories,
  retentionDays: config.historyRetentionDays,
  intervalMs: 6 * 60 * 60 * 1000,
  log: app.log,
});
poller.start();
retention.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} — إيقاف السيرفر بهدوء`);
    poller.stop();
    retention.stop();
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
