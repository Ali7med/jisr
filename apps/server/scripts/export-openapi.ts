/**
 * يُصدّر عقد OpenAPI من مخططات Fastify إلى `packages/shared/openapi.json`.
 *
 * الملف **يُلتزَم به في git**: أي تغيير عقد يظهر في المراجعة كـ diff صريح،
 * ومنه تُشتقّ الـ fixtures الذهبية التي تختبرها نماذج Dart — [ADR-0010].
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { Repositories } from '../src/db/repositories.ts';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../../../packages/shared/openapi.json');

/**
 * توليد العقد لا يلمس قاعدة بيانات: قيم البيئة هنا وهمية ومحلية،
 * والمستودعات لا تُستدعى أصلاً أثناء بناء المخطّطات.
 */
const config = loadConfig({
  ...process.env,
  DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgresql://localhost/openapi-export',
  JWT_SECRET: process.env['JWT_SECRET'] ?? randomBytes(32).toString('base64'),
  SECRETS_KEY_V1: process.env['SECRETS_KEY_V1'] ?? randomBytes(32).toString('base64'),
  LOG_LEVEL: 'silent',
});

const unusedRepositories = new Proxy({} as Repositories, {
  get() {
    throw new Error('توليد العقد لا يستخدم المستودعات');
  },
});

const app = await buildApp(config, { repositories: unusedRepositories });
await app.ready();
const document = app.swagger();
await app.close();

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`✅ OpenAPI ← ${target}`);
