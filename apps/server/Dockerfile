# صورة السيرفر — بناء متعدّد المراحل: أدوات البناء لا تصل للإنتاج.
# Node 24 لأن السيرفر يشغّل TypeScript بحذف الأنواع (ADR-0008 · ADR-0011).

FROM node:24-alpine AS build
WORKDIR /repo

RUN corepack enable

# طبقة الاعتمادات منفصلة: تعديل الكود لا يعيد تنزيلها
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/shared packages/shared
COPY apps/server apps/server

RUN pnpm --filter @jisr/shared build \
 && pnpm --filter @jisr/server exec prisma generate \
 && pnpm --filter @jisr/server build \
 && pnpm prune --prod

FROM node:24-alpine AS runtime
WORKDIR /app

# لا نعمل بـ root: ثغرة في العملية لا تعني ثغرة في المضيف
USER node
ENV NODE_ENV=production

COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=node:node /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build --chown=node:node /repo/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /repo/apps/server/package.json ./apps/server/
COPY --from=build --chown=node:node /repo/apps/server/prisma ./apps/server/prisma
COPY --from=build --chown=node:node /repo/apps/server/prisma.config.ts ./apps/server/

WORKDIR /app/apps/server
EXPOSE 3000

# الفحص من داخل الحاوية: يكشف عملية حيّة لكن قاعدتها غير قابلة للوصول
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
