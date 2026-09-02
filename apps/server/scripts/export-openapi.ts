/**
 * يُصدّر عقد OpenAPI من مخططات Fastify إلى `packages/shared/openapi.json`.
 *
 * الملف **يُلتزَم به في git**: أي تغيير عقد يظهر في المراجعة كـ diff صريح،
 * ومنه تُشتقّ الـ fixtures الذهبية التي تختبرها نماذج Dart — [ADR-0010].
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../../../packages/shared/openapi.json');

const app = await buildApp(loadConfig());
await app.ready();
const document = app.swagger();
await app.close();

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`✅ OpenAPI ← ${target}`);
