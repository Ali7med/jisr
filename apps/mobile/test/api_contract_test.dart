import 'package:flutter_test/flutter_test.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/ui/core/widgets/connection_banner.dart';

/// عيّنات مطابقة لعقد `packages/shared/openapi.json`.
///
/// **هذا هو حدّ الهاتف مع السيرفر**: بعد [ADR-0009] لم يبقَ في التطبيق
/// منطق ترجمة، فما يستحقّ الاختبار هو قراءة العقد — وتحديداً أن حقلاً
/// ناقصاً أو قيمة لا نعرفها **لا تُسقط الشاشة** (القاعدة الحاكمة 3).
void main() {
  group('قراءة الجهاز من العقد', () {
    test('تقرأ الحقول وتبني المعرّف المركّب', () {
      final device = Device.fromJson({
        'id': 'tuya:bf123',
        'integrationId': 'tuya',
        'accountId': 'acc-1',
        'nativeId': 'bf123',
        'name': 'مصباح الصالة',
        'category': 'light',
        'online': true,
        'model': 'X1',
        'productName': 'Smart Bulb',
        'room': 'الصالة',
        'isSubDevice': false,
      });

      expect(device.id, 'tuya:bf123');
      expect(device.category, DeviceCategory.light);
      expect(device.groupLabel, 'الصالة');
    });

    test('فئة لا نعرفها تصير «أخرى» ولا تُسقط الجهاز', () {
      final device = Device.fromJson({
        'integrationId': 'x',
        'nativeId': 'y',
        'category': 'فئة-من-سيرفر-أحدث',
      });

      expect(device.category, DeviceCategory.other);
      expect(device.name, 'جهاز بلا اسم');
      expect(device.online, isFalse);
    });

    test('«switch» في العقد ↔ switch_ في Dart ذهاباً وإياباً', () {
      final device = Device.fromJson({
        'integrationId': 'x',
        'nativeId': 'y',
        'category': 'switch',
      });

      expect(device.category, DeviceCategory.switch_);
      // الكاش يعيد الكتابة بنفس شكل العقد، لا باسم ثابتة Dart
      expect(device.toJson()['category'], 'switch');
      expect(Device.fromJson(device.toJson()).category, DeviceCategory.switch_);
    });
  });

  group('قراءة القدرة من العقد', () {
    test('تقرأ القيود وتحسب العرض بالمقياس', () {
      final capability = Capability.fromJson({
        'key': 'cur_power',
        'kind': 'range',
        'writable': false,
        'readable': true,
        'min': 0,
        'max': 50000,
        'step': 1,
        'scale': 1,
        'unit': 'W',
        'options': <String>[],
      });

      expect(capability.kind, CapabilityKind.range);
      expect(capability.toDisplay(235), 23.5);
      expect(capability.fromDisplay(23.5), 235);
      expect(capability.displayMax, 5000);
    });

    test('نوع لا نعرفه يبقى unknown ولا يُخفى', () {
      final capability = Capability.fromJson({'key': 'x', 'kind': 'bitmap'});
      expect(capability.kind, CapabilityKind.unknown);
    });

    test('الرحلة عبر الكاش لا تفقد شيئاً', () {
      final original = Capability.fromJson({
        'key': 'mode',
        'kind': 'mode',
        'writable': true,
        'options': ['white', 'colour'],
      });
      final restored = Capability.fromJson(original.toJson());

      expect(restored.options, ['white', 'colour']);
      expect(restored.writable, isTrue);
      expect(restored.kind, CapabilityKind.mode);
    });
  });

  group('قراءة بطاقة التكامل', () {
    test('تبني الحقول التي سيُبنى منها النموذج (القاعدة 7)', () {
      final info = IntegrationInfo.fromJson({
        'id': 'tuya',
        'nameAr': 'تويا',
        'nameEn': 'Tuya',
        'description': 'وصف',
        'supportsHistory': true,
        'fields': [
          {'key': 'accessId', 'label': 'Access ID', 'type': 'text'},
          {'key': 'accessSecret', 'label': 'Secret', 'type': 'secret'},
          {
            'key': 'host',
            'label': 'مركز البيانات',
            'type': 'choice',
            'defaultValue': 'openapi.tuyaeu.com',
            'options': [
              {'value': 'openapi.tuyaeu.com', 'label': 'أوروبا', 'hint': 'eu'},
            ],
          },
        ],
      });

      expect(info.fields, hasLength(3));
      expect(info.fields[1].type, CredentialFieldType.secret);
      expect(info.fields[2].options.single.label, 'أوروبا');
      expect(info.supportsHistory, isTrue);
    });

    test('نوع حقل لا نعرفه يُعامَل نصّاً بدل كسر الشاشة', () {
      final info = IntegrationInfo.fromJson({
        'id': 'x',
        'fields': [
          {'key': 'k', 'label': 'ل', 'type': 'نوع-جديد'},
        ],
      });

      expect(info.fields.single.type, CredentialFieldType.text);
    });
  });

  group('قراءة الحساب', () {
    test('حالة مرفوضة تُعطي رسالة تشرح ما العمل', () {
      final account = Account.fromJson({
        'id': 'a1',
        'integrationId': 'tuya',
        'label': 'بيتي',
        'status': 'invalid_credentials',
        'deviceCount': 3,
      });

      expect(account.needsAttention, isTrue);
      expect(account.statusMessage, contains('أعد إدخالها'));
    });

    test('حساب عامل لا يحتاج تنبيهاً', () {
      final account = Account.fromJson({'id': 'a', 'status': 'active'});
      expect(account.needsAttention, isFalse);
    });
  });

  group('الطابع الزمني للحالة القديمة', () {
    test('يُصاغ بالعربية بوحدة مفهومة', () {
      final now = DateTime.now();

      expect(relativeArabic(now.subtract(const Duration(seconds: 5))), 'قبل لحظات');
      expect(relativeArabic(now.subtract(const Duration(minutes: 7))), 'قبل 7 دقيقة');
      expect(relativeArabic(now.subtract(const Duration(hours: 3))), 'قبل 3 ساعة');
      expect(relativeArabic(now.subtract(const Duration(days: 2))), 'قبل 2 يوم');
    });
  });
}
