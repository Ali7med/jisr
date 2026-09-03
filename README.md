<div dir="rtl">

# جسر — Jisr

**منصة منزل ذكي سحابية، عربية أولاً، بلا أجهزة إضافية.**
سيرفر مركزي يدير كل التكاملات والأتمتة · لوحة ويب للإدارة · تطبيق هاتف للتحكّم اليومي.

> «افتح التطبيق، اربط حسابك، وتحكّم ببيتك من أي مكان — خلال خمس دقائق، بالعربي.»

## المنظومة

| القطعة | الدور | التقنية |
|---|---|---|
| **`apps/server`** | العقل: التكاملات · الأتمتة · الوقت الحقيقي · السجلّ | Fastify · TypeScript |
| **`apps/web`** | لوحة القيادة: ربط الحسابات · الأتمتة · المستخدمون | Next.js · TypeScript |
| **`apps/mobile`** | الريموت: تحكّم يومي سريع | Flutter · Dart |
| **`packages/shared`** | عقود API وأنواع مشتركة | TypeScript |

</div>

```
jisr/
├── packages/shared/   عقود API (سيرفر + ويب)
├── apps/
│   ├── server/        ⏳ Fastify — عقل المنظومة
│   ├── web/           ⏳ Next.js — لوحة الإدارة
│   └── mobile/        ✅ Flutter — يعمل، يتحوّل لعميل رفيع
└── docs/              الدراسة · الهيكلية · خارطة الطريق · القرارات
```

<div dir="rtl">

## الحالة

| | |
|---|---|
| تطبيق الهاتف — **عميل رفيع** يتصل بالسيرفر وحده | ✅ `analyze` نظيف · 23 اختباراً · APK يُبنى |
| **التحقق مقابل Tuya حقيقي** | 🔴 **الخطوة التالية** — [T-V](docs/03-roadmap.md) · تحتاج مفاتيحك وجهازك |
| السيرفر | 🟢 مصادقة · حسابات · أجهزة · أوامر · سجلّ · قناة لحظية — ١١٢ اختباراً ([P1](docs/03-roadmap.md) · P2.2 · P2.3) |
| النشر | 🟡 التركيبة جاهزة ([دليل التشغيل](docs/runbook.md))، ولم تُنشر على خادم بعد |
| الويب | ⏳ حسب [خارطة الطريق](docs/03-roadmap.md) |

## اقرأ أولاً

| الوثيقة | ماذا تجيب |
|---|---|
| **[01 — الدراسة الشاملة](docs/01-study.md)** | لماذا المشروع؟ أين نتفوّق على Home Assistant وأين لا؟ |
| **[02 — الهيكلية الكبرى](docs/02-architecture.md)** | كيف تترابط القطع الأربع |
| **[03 — خارطة الطريق](docs/03-roadmap.md)** | ما التالي وبأي معيار قبول |
| [القرارات المعمارية](docs/adr/) | لماذا اتُّخذ كل قرار — ١٤ قراراً، منها ٣ مَنسوخة بأخرى |
| [مرجع Tuya](docs/reference/tuya.md) | التوقيع · المسارات · نقاط البيانات · أكواد الخطأ |
| **[دليل التشغيل](docs/runbook.md)** | النشر · النسخ الاحتياطية · الأعطال الشائعة · تدوير المفتاح · تمرين الاستعادة |

## تشغيل التطبيق

</div>

```bash
cd apps/mobile
flutter pub get
flutter analyze && flutter test
flutter run --dart-define=JISR_SERVER_URL=http://10.0.2.2:3000
```

<div dir="rtl">

## تشغيل السيرفر

مرة واحدة على الجهاز: `corepack enable` (يضع pnpm في المسار).

</div>

```bash
cp apps/server/.env.example apps/server/.env
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm --filter @jisr/server db:migrate
pnpm --filter @jisr/server dev
```

<div dir="rtl">

املأ `JWT_SECRET` و`SECRETS_KEY_V1` في `.env` (`openssl rand -base64 32` لكلٍّ منهما) — السيرفر يرفض الإقلاع بدونهما. ثم `curl http://localhost:3000/health`. أوامر أخرى: `pnpm -r typecheck` · `pnpm -r test` · `pnpm openapi` (يعيد توليد عقد `packages/shared/openapi.json` — يُلتزَم به في git).

للنشر على خادم: انسخ `deploy/env.prod.example` إلى `.env.prod` واملأه، ثم `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` — التفاصيل والتراجع والأعطال في [دليل التشغيل](docs/runbook.md).

</div>

<div dir="rtl">

## القواعد الحاكمة

سبع قواعد لا تُكسر، أهمّها: **لا اسم شركة خارج `server/src/integrations/`**، و**إضافة شركة جديدة = ملف تكامل واحد + سطر في السجلّ** (لا شاشة جديدة في الهاتف ولا في الويب).

> النص الكامل والمُلزِم في [02 — الهيكلية § 9](docs/02-architecture.md#٩-قواعد-ثابتة) — **مصدر واحد لا يُكرَّر هنا** كي لا تتباعد النسختان.

## الترخيص

مشروع خاص.

</div>
