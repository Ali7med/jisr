# دليل التشغيل (Runbook)

**آخر تحديث:** 2026-09-03
**لمن:** المشغّل الوحيد للمشروع — أي أنا في الثالثة فجراً وقد نسيت كل شيء.

> **القاعدة:** كل إجراء هنا مكتوب ليُنفَّذ بلا تفكير. إن احتاج خطوةٌ اجتهاداً
> فذلك عيب في الدليل لا في القارئ — صحّحها فور اكتشافها.

---

## ١ — أرقام يجب معرفتها

| البند | القيمة | المرجع |
|---|---|---|
| هدف التوفّر | 99.5% شهرياً — أي نحو ٣ ساعات و٤٠ دقيقة انقطاع مسموح في الشهر | [ADR-0014](adr/0014-availability-target.md) |
| عتبة إبطال «السيرفر إلزامي» | < 99% شهرين متتاليين، أو انقطاعان > 30 دقيقة في شهر | [ADR-0009](adr/0009-server-mandatory-thin-client.md) |
| استبقاء السلسلة الزمنية | 90 يوماً (`HISTORY_RETENTION_DAYS`) | [ADR-0013](adr/0013-postgresql-prisma.md) |
| استبقاء النسخ الاحتياطية | 14 يوماً (`BACKUP_KEEP_DAYS`) | — |
| تمرين الاستعادة | **ربع سنوي، إلزامي** | [الهيكلية § 8](02-architecture.md) |

---

## ٢ — فحص سريع: هل الخدمة بخير؟

```bash
curl -fsS https://$JISR_DOMAIN/health        # حيّ؟
curl -fsS https://$JISR_DOMAIN/health/ready  # وقاعدته تستجيب؟
```

`/health` قد يردّ 200 و`/health/ready` يردّ 503 — هذا **بالضبط** ما يميّز
«العملية تعمل» عن «الخدمة صالحة». عند 503 اذهب مباشرة إلى § 5.

```bash
docker compose -f docker-compose.prod.yml ps        # حالة الحاويات
docker compose -f docker-compose.prod.yml logs -n 200 server
```

---

## ٣ — النشر

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

الهجرات تُطبَّق تلقائياً عند إقلاع السيرفر (`prisma migrate deploy` في
`command`) — نسخة جديدة لا تعمل على مخطّط قديم.

**التراجع:**

```bash
git checkout <آخر-وسم-يعمل>
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

⚠️ التراجع عن **الكود** سهل؛ التراجع عن **هجرة** ليس كذلك. هجرة تحذف عموداً
أو تغيّر نوعه تحتاج نسخة احتياطية قبلها — خذها يدوياً (§ 4) قبل نشر يحمل
هجرة هدّامة.

---

## ٤ — النسخ الاحتياطية

حاوية `backup` تأخذ نسخة كل ٢٤ ساعة إلى الحجم `jisr-backups` وتحذف ما تجاوز
14 يوماً.

**نسخة فورية قبل عملية خطرة:**

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U jisr --no-owner --no-privileges jisr | gzip > "jisr-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

**سحب نسخة خارج الخادم** (المهم: نسخة على نفس القرص لا تنجو من موت القرص):

```bash
docker compose -f docker-compose.prod.yml cp backup:/backups ./backups-local
```

---

## ٥ — الأعطال الشائعة

### `/health/ready` يردّ 503

```bash
docker compose -f docker-compose.prod.yml logs -n 100 postgres
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U jisr
```

- القاعدة لا تُقلع ← غالباً القرص ممتلئ: `df -h`
- القاعدة تعمل والسيرفر لا يصلها ← تحقّق من `DATABASE_URL` في `.env.prod`

### القرص ممتلئ

المتّهم الأول هو `state_history`:

```sql
SELECT pg_size_pretty(pg_total_relation_size('state_history'));
SELECT count(*) FROM state_history;
```

الحلّ الفوري: أنزل `HISTORY_RETENTION_DAYS` وأعد تشغيل السيرفر — مهمّة
التنظيف تعمل كل ٦ ساعات، أو نظّف يدوياً:

```sql
DELETE FROM state_history WHERE recorded_at < now() - interval '30 days';
```

ثم `VACUUM FULL state_history;` لاستعادة المساحة فعلياً (يقفل الجدول —
نفّذه في وقت هادئ). إن تكرّر: حان وقت التقسيم الشهري في [ADR-0013](adr/0013-postgresql-prisma.md).

### مستخدم يشكو أن أجهزته «اختفت»

غالباً حسابه صار `invalid_credentials` أو `expired`:

```sql
SELECT id, integration_id, label, status, last_checked_at FROM accounts WHERE user_id = '<uuid>';
```

- `invalid_credentials` ← الشركة رفضت الاعتمادات: يعيد إدخالها من الويب
- `expired` ← انتهى اشتراك مشروعه لدى الشركة (شائع مع تجربة Tuya المجانية —
  [الدراسة § 7](01-study.md#٧-المخاطر))

### طلبات كثيرة / 429

الحدّ العام 300 طلب/دقيقة لكل عنوان، و10/دقيقة على `/auth`. إن كان الضغط
شرعياً ارفع السقف في `src/app.ts`؛ وإن كان تخمين كلمات مرور فالسقف يعمل
كما ينبغي — راجع السجلّ للعنوان المصدر.

---

## ٦ — تدوير مفتاح التشفير

المفاتيح مرقّمة: **الكتابة بالنسخة النشطة، والقراءة بأي نسخة معروفة**. لذلك
التدوير بلا توقّف:

1. ولّد مفتاحاً: `openssl rand -base64 32`
2. في `.env.prod`: `SECRETS_KEY_V2=<الجديد>` مع إبقاء `SECRETS_KEY_V1`
3. `SECRETS_KEY_VERSION=2`
4. أعد تشغيل السيرفر — كل حساب **يُحدَّث** من الآن يُعاد ختمه بالنسخة 2
5. اطلب من كل مستخدم تحديث حسابه، أو اكتب سكربتاً يفكّ ويعيد الختم
6. **لا تحذف** `SECRETS_KEY_V1` قبل التحقّق:
   ```sql
   SELECT key_version, count(*) FROM accounts GROUP BY key_version;
   ```
   حذفه قبل ذلك يجعل الحسابات القديمة **غير قابلة للفكّ نهائياً**.

---

## ٧ — تمرين الاستعادة (ربع سنوي — إلزامي)

> **نسخة لم تُستعَد مرة ليست نسخة احتياطية.** هذا التمرين ليس بروتوكولاً
> شكلياً: أول مرة نُجريه هي المرة التي نكتشف فيها ما ينقص الدليل.

على **خادم نظيف** (أو جهاز محلي)، لا على الإنتاج:

```bash
git clone <repo> jisr-restore && cd jisr-restore
cp deploy/env.prod.example .env.prod   # املأه بأسرار اختبارية جديدة
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
gunzip -c jisr-<الطابع>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U jisr -d jisr
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d server
curl -fsS http://localhost:3000/health/ready
```

**سجّل النتيجة في الجدول أدناه — حتى لو نجح التمرين.** التاريخ الفارغ يعني
أننا لا نعرف إن كانت نسخنا صالحة.

| التاريخ | النسخة المستعادة | المدة | النتيجة وما تعلّمناه |
|---|---|---|---|
| — | — | — | *لم يُجرَ بعد — أول تمرين مستحقّ مع أول نشر (P2.4)* |

⚠️ **الأسرار لا تُستعاد مع القاعدة**: `SECRETS_KEY_V*` تعيش خارجها. استعادة
بلا المفتاح الصحيح تعطيك حسابات مشفّرة لا تُفكّ. تحقّق من ذلك في التمرين
بفتح جهاز فعلياً، لا بالاكتفاء بردّ `/health/ready`.

---

## ٨ — المراقبة والتنبيه

فحص خارجي كل دقيقة على `https://$JISR_DOMAIN/health/ready` — **خارجي** لأن
مراقبة تعمل على نفس الخادم تسقط معه.

خيارات مجانية تكفي مشروعاً فردياً: UptimeRobot أو Better Stack أو
healthchecks.io. التنبيه يذهب لقناة **يقرؤها الشخص وهو نائم** (رسالة هاتف)،
لا لبريد يُفتح صباحاً.

ما يستحق تنبيهاً:

| الإشارة | العتبة |
|---|---|
| `/health/ready` ≠ 200 | دقيقتان متتاليتان |
| مساحة القرص | > 80% |
| فشل النسخة الاحتياطية | مرتان متتاليتان (`[backup] ❌` في السجلّ) |
| نسبة 5xx | > 1% خلال ١٠ دقائق |

### صفحة الحالة العامة (P2.6)

**تُبنى على المراقب الخارجي، لا على سيرفرنا.** السبب بديهي حين يُقال:
صفحة حالة يستضيفها الخادم الذي نقيس توفّره تسقط معه، فتُظهر «كل شيء
بخير» بالضبط حين لا يكون كذلك.

UptimeRobot وBetter Stack وhealthchecks.io تعطي صفحة حالة عامة مجاناً من
نفس الفحص الذي في § 8. الخطوات:

1. أنشئ فحصاً على `https://$JISR_DOMAIN/health/ready` كل دقيقة.
2. فعّل صفحة الحالة العامة واربطها بنطاق فرعي (`status.$JISR_DOMAIN`).
3. ضع رابطها في [README](../README.md) وفي اللوحة، وسجّل كل حادثة بسببها
   ومدّتها — الشفافية بديلنا عن «بياناتك عندك» ([ADR-0014](adr/0014-availability-target.md)).

الأرقام الشهرية تُقرأ من هناك وتُقاس عليها 99.5%.
