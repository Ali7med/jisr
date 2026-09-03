import 'package:flutter_test/flutter_test.dart';
import 'package:jisr/domain/models/app_notification.dart';
import 'package:jisr/domain/models/automation.dart';
import 'package:jisr/domain/models/scene.dart';

/// عيّنات مطابقة لعقود `scene.ts` و`notification.ts` و`automation.ts`.
///
/// نفس منطق `api_contract_test.dart`: ما يستحقّ الاختبار هو أن حقلاً ناقصاً أو
/// قيمة من سيرفر أحدث **لا تُسقط الشاشة** (القاعدة الحاكمة 3)، وأن نتيجة
/// المشهد تُقرأ كما هي بلا تلطيف.
void main() {
  group('قراءة المشهد من العقد', () {
    test('تقرأ الخطوات والاسم والأيقونة', () {
      final scene = Scene.fromJson({
        'id': '9f1c2e40-0000-4000-8000-000000000001',
        'name': 'سهرة',
        'icon': 'movie',
        'steps': [
          {'deviceId': 'tuya:abc', 'key': 'switch_led', 'value': false},
          {'deviceId': 'other:xyz', 'key': 'switch_1', 'value': true},
        ],
        'createdAt': '2026-09-01T10:00:00.000Z',
      });

      expect(scene.name, 'سهرة');
      expect(scene.steps, hasLength(2));
      expect(scene.steps.first.deviceId, 'tuya:abc');
      expect(scene.steps.first.value, isFalse);
    });

    test('مشهد بلا حقول لا يرمي ويبقى معروضاً', () {
      final scene = Scene.fromJson(const {});

      expect(scene.name, 'مشهد بلا اسم');
      expect(scene.icon, isEmpty);
      expect(scene.steps, isEmpty);
    });

    test('خطوة ليست كائناً تُتجاهل ولا تُسقط المشهد', () {
      final scene = Scene.fromJson({
        'name': 'صباح',
        'steps': [
          'نصّ غريب',
          {'deviceId': 'tuya:a', 'key': 'switch', 'value': true},
        ],
      });

      expect(scene.steps, hasLength(1));
    });
  });

  group('قراءة نتيجة تشغيل المشهد', () {
    test('نجاح كامل', () {
      final result = SceneRunResult.fromJson({
        'sceneId': 's1',
        'succeeded': 3,
        'failed': 0,
        'failures': <Object>[],
        'at': '2026-09-02T12:00:00.000Z',
      });

      expect(result.allSucceeded, isTrue);
      expect(result.partial, isFalse);
      expect(result.nothingRan, isFalse);
    });

    test('نجاح جزئي يحتفظ بسبب كل خطوة فاشلة', () {
      final result = SceneRunResult.fromJson({
        'sceneId': 's1',
        'succeeded': 2,
        'failed': 1,
        'failures': [
          {'deviceId': 'tuya:abc', 'message': 'الجهاز غير متصل'},
        ],
      });

      expect(result.partial, isTrue);
      expect(result.allSucceeded, isFalse);
      expect(result.failures.single.message, 'الجهاز غير متصل');
    });

    test('فشل كل الخطوات يُميَّز عن النجاح الجزئي', () {
      final result = SceneRunResult.fromJson({
        'succeeded': 0,
        'failed': 2,
        'failures': [
          {'deviceId': 'a'},
          {'deviceId': 'b', 'message': '   '},
        ],
      });

      expect(result.nothingRan, isTrue);
      expect(result.partial, isFalse);
      // رسالة فارغة من السيرفر تُستبدل بجملة تقول للمستخدم ما العمل.
      expect(result.failures.first.message, contains('تحقّق'));
      expect(result.failures.last.message, contains('تحقّق'));
    });
  });

  group('قراءة الإشعار من العقد', () {
    test('تقرأ الحقول وتحوّل الوقت للتوقيت المحلي', () {
      final notification = AppNotification.fromJson({
        'id': 'n1',
        'title': 'تسرّب ماء',
        'body': 'حسّاس المطبخ أبلغ عن ماء',
        'severity': 'critical',
        'read': false,
        'createdAt': '2026-09-02T09:30:00.000Z',
      });

      expect(notification.severity, NotificationSeverity.critical);
      expect(notification.read, isFalse);
      expect(notification.createdAt.isUtc, isFalse);
    });

    test('خطورة لا نعرفها تصير «معلومة» ولا تُخفي الإشعار', () {
      final notification = AppNotification.fromJson({
        'id': 'n2',
        'title': 'ت',
        'severity': 'كارثي-جداً',
      });

      expect(notification.severity, NotificationSeverity.info);
      expect(notification.body, isEmpty);
    });

    test('الوارد على القناة يتصدّر القائمة ويزيد العدّاد مرة واحدة', () {
      const feed = NotificationFeed(items: [], unread: 0);
      final incoming = AppNotification.fromJson({
        'id': 'n3',
        'title': 'جديد',
        'read': false,
      });

      final updated = feed.withIncoming(incoming);
      expect(updated.items.first.id, 'n3');
      expect(updated.unread, 1);

      // إشعار وصل مقروءاً (زامنه جهاز آخر) لا يحرّك العدّاد.
      final alreadyRead = AppNotification.fromJson({
        'id': 'n4',
        'title': 'مقروء',
        'read': true,
      });
      expect(updated.withIncoming(alreadyRead).unread, 1);
    });

    test('تعليم الكل كمقروء يصفّر العدّاد ويحدّث كل عنصر', () {
      final feed = NotificationFeed(
        items: [
          AppNotification.fromJson({'id': 'a', 'read': false}),
          AppNotification.fromJson({'id': 'b', 'read': false}),
        ],
        unread: 2,
      ).allRead();

      expect(feed.unread, 0);
      expect(feed.items.every((item) => item.read), isTrue);
    });
  });

  group('قراءة الأتمتة من العقد', () {
    test('مُشغِّل وقت يُصاغ جملة عربية مفهومة', () {
      final automation = Automation.fromJson({
        'id': 'a1',
        'name': 'إضاءة الصباح',
        'enabled': true,
        'trigger': {
          'kind': 'schedule',
          'at': '07:30',
          'days': [0, 6],
          'timezone': 'Asia/Baghdad',
        },
        'createdAt': '2026-09-01T00:00:00.000Z',
      });

      final summary = automation.trigger.describeArabic();
      expect(summary, contains('الأحد'));
      expect(summary, contains('السبت'));
      expect(summary, contains('07:30'));
      expect(automation.lastRunAt, isNull);
    });

    test('أيام فارغة تعني كل يوم', () {
      final trigger = AutomationTrigger.fromJson({
        'kind': 'schedule',
        'at': '22:00',
        'days': <int>[],
        'timezone': '',
      });

      expect(trigger.describeArabic(), 'كل يوم الساعة 22:00');
    });

    test('مُشغِّل حالة يستبدل معرّف الجهاز باسمه', () {
      final trigger = AutomationTrigger.fromJson({
        'kind': 'state',
        'deviceId': 'tuya:abc',
        'key': 'temp_current',
        'op': 'gt',
        'value': 30,
      });

      final summary = trigger.describeArabic(
        deviceName: (id) => id == 'tuya:abc' ? 'مستشعر الصالة' : id,
      );

      expect(summary, contains('مستشعر الصالة'));
      expect(summary, contains('أكبر من'));
      expect(summary, contains('30'));
      // بلا مُترجِم أسماء يظهر المعرّف الخام بدل سطر ناقص.
      expect(trigger.describeArabic(), contains('tuya:abc'));
    });

    test('مُشغِّل من سيرفر أحدث يقول للمستخدم ما العمل بدل سطر فارغ', () {
      final trigger = AutomationTrigger.fromJson({'kind': 'sun_position'});

      expect(trigger.kind, AutomationTriggerKind.unknown);
      expect(trigger.describeArabic(), contains('حدّث التطبيق'));
    });

    test('أتمتة بلا مُشغِّل صالح لا ترمي', () {
      final automation = Automation.fromJson({'id': 'x'});

      expect(automation.name, 'أتمتة بلا اسم');
      expect(automation.enabled, isFalse);
      expect(automation.trigger.kind, AutomationTriggerKind.unknown);
    });

    test('سجلّ التنفيذ يقرأ النجاح والتفصيل والوقت', () {
      final run = AutomationRun.fromJson({
        'succeeded': false,
        'detail': 'الجهاز غير متصل',
        'ranAt': '2026-09-02T08:00:00.000Z',
      });

      expect(run.succeeded, isFalse);
      expect(run.detail, 'الجهاز غير متصل');
    });
  });
}
