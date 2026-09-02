# مرجع Tuya — التكامل التقني

مرجع تقني لكل ما يخصّ Tuya Cloud OpenAPI في هذا المشروع.

> **ملاحظة (2026-09-02):** مسارات `lib/...` أدناه تخصّ تطبيق الهاتف في مرحلة T-V. بعد P1 ينتقل التكامل إلى `apps/server/src/integrations/tuya/` ([ADR-0009](../adr/0009-server-mandatory-thin-client.md)) — تُحدَّث المسارات هنا في نفس كومِت النقل.

## المحتويات
1. [مراكز البيانات](#١-مراكز-البيانات)
2. [التوقيع](#٢-التوقيع)
3. [المصادقة والتوكن](#٣-المصادقة-والتوكن)
4. [المسارات المستخدمة](#٤-المسارات-المستخدمة)
5. [نموذج نقاط البيانات](#٥-نموذج-نقاط-البيانات-dp)
6. [أكواد الخطأ](#٦-أكواد-الخطأ)
7. [حدود المنصة](#٧-حدود-المنصة)

---

## ١. مراكز البيانات

| المركز | `openapi` | `images` |
|---|---|---|
| أوروبا الوسطى | `openapi.tuyaeu.com` | `images.tuyaeu.com` |
| أوروبا الغربية | `openapi-weaz.tuyaeu.com` | `images.tuyaeu.com` |
| أمريكا الغربية | `openapi.tuyaus.com` | `images.tuyaus.com` |
| أمريكا الشرقية | `openapi-ueaz.tuyaus.com` | `images.tuyaus.com` |
| الصين | `openapi.tuyacn.com` | `images.tuyacn.com` |
| الهند | `openapi.tuyain.com` | `images.tuyain.com` |

المصدر: `lib/config/tuya_config.dart` → `TuyaDataCenter`.

> المركز الخاطئ يُرجع **`1106 permission deny`** لا رسالة واضحة. هذا أشيع خطأ في التكامل مع Tuya.
> حقل `icon` في استجابة الأجهزة **مسار نسبي** — يُبنى الرابط عبر `TuyaDataCenter.iconUrl()`.

---

## ٢. التوقيع

التنفيذ: `lib/data/services/tuya_signer.dart` — **Dart خالص** بلا Flutter، ليعمل في `tool/tuya_probe.dart` وتبقى اختباراته سريعة.

### الخوارزمية

```
stringToSign = HTTPMethod + "\n"
             + SHA256(body)  + "\n"      ← جسم فارغ ⇒ e3b0c442…b855
             + signHeaders   + "\n"      ← فارغ عندنا (لا نستخدم Signature-Headers)
             + url                       ← المسار + المعاملات مرتّبة أبجدياً

str  = clientId + [accessToken] + t + nonce + stringToSign
sign = HMAC-SHA256(str, accessSecret).toUpperCase()
```

### الفروق الثلاثة التي تُفشل التوقيع

| # | التفصيل | الخطأ الشائع |
|---|---|---|
| 1 | `accessToken` **يُحذف** من `str` عند طلب التوكن نفسه، ويُدرَج في كل طلب آخر | إدراجه دائماً ⇒ `1004` |
| 2 | معاملات الاستعلام **مرتّبة أبجدياً** داخل التوقيع | ترتيب الإدخال ⇒ `1004` |
| 3 | `t` = ميلي ثانية (13 رقماً) UTC | ساعة الجهاز المنحرفة ⇒ `1004` |

### الترويسات المرسلة

```
client_id     : <ACCESS_ID>
sign          : <64 حرفاً كبيراً>
t             : <13 رقماً>
sign_method   : HMAC-SHA256
nonce         : <يُرسل فقط إن كان غير فارغ>
access_token  : <لطلبات الأعمال فقط>
Content-Type  : application/json
```

`nonce` فارغ افتراضياً وغير مُرسَل — هذا المسار الأكثر توافقاً مع تنفيذات Tuya الرسمية.

### التحقق
`test/tuya_signer_test.dart` — **12 اختباراً**. التواقيع المتوقّعة **حُسبت خارجياً** بـ `openssl dgst -sha256 -hmac`، فالاختبار يقارن تنفيذنا بمرجع مستقل لا بنفسه.

---

## ٣. المصادقة والتوكن

```
GET /v1.0/token?grant_type=1
→ { access_token, refresh_token, uid, expire_time }   // expire_time بالثواني (~7200)
```

`TuyaClient` (`lib/data/services/tuya_client.dart`):

- **تجديد استباقي** قبل الانتهاء بـ 5 دقائق (`TuyaTuning.tokenRefreshMargin`) — يتجنّب سباق الزمن مع الخادم.
- **منع الازدحام**: الطلبات المتوازية تشترك في `Future` واحد بدل جلب توكنات متعدّدة.
- **إعادة محاولة واحدة**: عند `1010/1011/1012` يُمسح التوكن ويُعاد الطلب مرة واحدة فقط (لا حلقة لا نهائية).
- **جلب توكن جديد بدل `refresh_token`** — في وضع المشروع الاستدعاء رخيص ولا يحتاج حالة سابقة؛ يتجنّب حالة عالقة عند انتهاء `refresh_token` بدوره.

### ظرف الاستجابة
كل استجابات Tuya تأتي بـ HTTP 200 حتى عند الفشل:

```json
{ "success": true|false, "code": 1106, "msg": "permission deny", "result": …, "t": 1700000000000 }
```

لذا `validateStatus: (_) => true` في Dio، والتفسير يجري في `TuyaClient._unwrap`.

---

## ٤. المسارات المستخدمة

| الغرض | الطلب |
|---|---|
| توكن | `GET /v1.0/token?grant_type=1` |
| أجهزة المستخدم | `GET /v1.0/users/{uid}/devices` |
| تفاصيل جهاز | `GET /v1.0/devices/{id}` |
| **المواصفات** | `GET /v1.0/devices/{id}/specifications` |
| الحالة | `GET /v1.0/devices/{id}/status` |
| **أمر تحكم** | `POST /v1.0/devices/{id}/commands` |
| سجلّ تاريخي | `GET /v1.0/devices/{id}/logs?type=7&start_time&end_time&size&codes` |

جسم أمر التحكم:
```json
{ "commands": [ { "code": "switch_1", "value": true } ] }
```

المصدر: `lib/config/tuya_config.dart` → `TuyaPaths`.

---

## ٥. نموذج نقاط البيانات (DP)

كل جهاز = مجموعة **Data Points**. `specifications` ترجع مجموعتين:

- **`functions[]`** — ما يمكن التحكم به
- **`status[]`** — ما يمكن قراءته

نقطة قد تكون في الاثنين (`switch_1` مثلاً). ما هو في `status` فقط ⇒ للقراءة، وهو ما يحسبه `DeviceSpec.readOnly`.

### الأنواع

| `type` | القيمة | `values` |
|---|---|---|
| `Boolean` | `true`/`false` | `{}` |
| `Integer` (أو `Value` في `/functions`) | عدد صحيح **خام** | `{min, max, scale, step, unit}` |
| `Enum` | نص | `{range: [...]}` |
| `String` | نص | `{maxlen}` |
| `Json` / `Raw` | نص/base64 | متغيّر |

> ⚠️ `values` يصل **نصّاً يحوي JSON**، لا كائناً:
> `"{\"min\":0,\"max\":1000,\"scale\":1,\"step\":1,\"unit\":\"W\"}"`
> يتولّى `DpDefinition._parseValues` الحالتين، ويتجاهل ما لا يُحلَّل بدل الانهيار.

### `scale` — أكثر تفصيل يُنسى

```
القيمة المعروضة = القيمة الخام ÷ 10^scale
القيمة المرسلة  = القيمة المعروضة × 10^scale
```

| المثال | الخام | scale | المعروض |
|---|---|---|---|
| `temp_current` | 235 | 1 | **23.5 °C** |
| `cur_power` | 1250 | 1 | **125.0 W** |
| `cur_voltage` | 2200 | 1 | **220.0 V** |
| `bright_value_v2` | 500 | 0 | **500** |

التحويل في `DpDefinition.toDisplay` / `fromDisplay`، ويُطبَّق في **الواجهة والرسم البياني معاً** — لو طُبِّق في أحدهما فقط لاختلف الرقمان.

### مثال استجابة

```json
{
  "category": "wsdcg",
  "functions": [
    { "code": "temp_unit_convert", "type": "Enum", "values": "{\"range\":[\"c\",\"f\"]}" }
  ],
  "status": [
    { "code": "va_temperature", "type": "Integer",
      "values": "{\"unit\":\"℃\",\"min\":-200,\"max\":600,\"scale\":1,\"step\":1}" },
    { "code": "va_humidity", "type": "Integer",
      "values": "{\"unit\":\"%\",\"min\":0,\"max\":100,\"scale\":0,\"step\":1}" }
  ]
}
```

---

## ٦. أكواد الخطأ

مترجمة في `lib/utils/tuya_exception.dart`.

| الكود | المعنى | الإجراء |
|---|---|---|
| `1001` | بيانات الطلب غير صحيحة | راجع المعاملات |
| `1004` | **التوقيع غير صالح** | Access Secret · ساعة الجهاز |
| `1010`–`1012` | التوكن منتهٍ/غير صالح | يُعالَج تلقائياً بإعادة محاولة واحدة |
| `1100` | معامل ناقص | |
| `1106` | **permission deny** | مركز بيانات · تفعيل API · ربط الحساب |
| `1108`/`1109` | معامل غير صالح | |
| `2001` | تجاوز الحصة الشهرية | قلّل التحديث أو رقِّ الخطة |
| `2007` | انتهى اشتراك المشروع | |
| `2008`/`2009` | أمر غير مدعوم من الجهاز | راجع `functions` للجهاز |
| `2010` | المشروع غير موجود/غير مفعّل | |
| `2406` | المشروع غير مربوط بحساب تطبيق | امسح QR مجدداً |
| `28841002` | انتهت التجربة المجانية | |
| `28841101` | لا صلاحية على الجهاز | |
| `28841105` | الجهاز غير متصل | |

كود غير معروف يُعرض مع نص Tuya الأصلي — **لا نبتلع أخطاء لا نفهمها**.

---

## ٧. حدود المنصة

### الخطة التجريبية
| البند | الحد |
|---|---|
| استدعاءات API | ~26,000 / شهر |
| رسائل | ~68,000 / شهر |
| أجهزة | 50 |
| أجهزة قابلة للتحكم | 10 |
| مراكز بيانات | 1 |
| الاستخدام التجاري | **ممنوع** |

**حساب الاستهلاك:** شاشة تفاصيل مفتوحة = ٦ استدعاءات/دقيقة. ساعة مفتوحة = 360 استدعاء.
لذلك التحديث الدوري يتوقّف في الخلفية ([02 — المعمارية](../02-architecture.md) § إدارة الحالة).

### ما لا يوفّره Cloud API
| الميزة | البديل |
|---|---|
| إقران أجهزة جديدة | تطبيق Smart Life ([ADR-0001](../adr/0001-use-cloud-openapi.md)) |
| MQTT للعملاء | **غير متاح** — Tuya لا تعرضه |
| دفع فوري (Pulsar) | server-to-server فقط ([ADR-0004](../adr/0004-polling-instead-of-pulsar.md)) |
| الغرف مع قائمة الأجهزة | نجمّع حسب الفئة حالياً |

---

## مراجع رسمية
- [Sign Requests](https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g)
- [Device Control](https://developer.tuya.com/en/docs/cloud/device-control?id=K95zu01ksols7)
- [Get User's Device List](https://developer.tuya.com/en/docs/cloud/cacc9c4989?id=Ka7kk03zdecl4)
- [Device Message Subscription (Pulsar)](https://developer.tuya.com/en/docs/iot/subscribe?id=Kbwtw7fhhjabw)
- [Pricing](https://developer.tuya.com/en/docs/iot/membership-service?id=K9m8k45jwvg9j)
