import { defineConfig } from 'prisma/config';

/**
 * إعداد Prisma 7: عنوان الاتصال هنا لأوامر الهجرة فقط — أما وقت التشغيل
 * فالعميل يأخذ محوّلاً صريحاً (`src/db/client.ts`). لا سرّ في هذا الملف:
 * كله من البيئة.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
