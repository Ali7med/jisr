import 'package:jisr/domain/models/integration_info.dart';

/// مراكز بيانات Tuya.
///
/// اختيار المركز الخاطئ هو أشيع سبب لخطأ `1106 permission deny`.
enum TuyaDataCenter {
  centralEurope('openapi.tuyaeu.com', 'images.tuyaeu.com', 'أوروبا الوسطى'),
  westernEurope(
    'openapi-weaz.tuyaeu.com',
    'images.tuyaeu.com',
    'أوروبا الغربية',
  ),
  westernAmerica('openapi.tuyaus.com', 'images.tuyaus.com', 'أمريكا الغربية'),
  easternAmerica(
    'openapi-ueaz.tuyaus.com',
    'images.tuyaus.com',
    'أمريكا الشرقية',
  ),
  china('openapi.tuyacn.com', 'images.tuyacn.com', 'الصين'),
  india('openapi.tuyain.com', 'images.tuyain.com', 'الهند');

  const TuyaDataCenter(this.host, this.imageHost, this.labelAr);

  final String host;
  final String imageHost;
  final String labelAr;

  String get baseUrl => 'https://$host';

  /// يحوّل مسار الأيقونة النسبي من Tuya إلى رابط كامل.
  String? iconUrl(String? icon) {
    if (icon == null || icon.isEmpty) return null;
    if (icon.startsWith('http')) return icon;
    final path = icon.startsWith('/') ? icon.substring(1) : icon;
    return 'https://$imageHost/$path';
  }

  static TuyaDataCenter fromHost(String? host) => values.firstWhere(
    (dc) => dc.host == host,
    orElse: () => TuyaDataCenter.centralEurope,
  );
}

/// ثوابت تكامل Tuya وبطاقة تعريفه.
abstract final class TuyaConfig {
  /// معرّف التكامل — يدخل في معرّفات الأجهزة (`tuya:abc`).
  /// **تغييره يُبطل كل الحسابات المحفوظة.**
  static const String id = 'tuya';

  // مفاتيح حقول الاعتماد.
  static const String keyAccessId = 'accessId';
  static const String keyAccessSecret = 'accessSecret';
  static const String keyUid = 'uid';
  static const String keyHost = 'host';

  /// بطاقة التعريف — منها تُبنى شاشة إضافة الحساب بلا كود مخصّص.
  static final IntegrationInfo info = IntegrationInfo(
    id: id,
    nameAr: 'تويا / Smart Life',
    nameEn: 'Tuya / Smart Life',
    description:
        'يغطّي آلاف الأجهزة التي تعمل بتطبيق Smart Life أو Tuya Smart: '
        'مفاتيح، مقابس، إضاءة، حساسات، عدّادات طاقة، وأجهزة أشعة تحت حمراء.',
    setupUrl: 'https://iot.tuya.com',
    supportsHistory: true,
    fields: [
      const CredentialField(
        key: keyAccessId,
        label: 'Access ID',
        type: CredentialFieldType.text,
        hint: 'من صفحة Overview في مشروعك على iot.tuya.com',
      ),
      const CredentialField(
        key: keyAccessSecret,
        label: 'Access Secret',
        type: CredentialFieldType.secret,
        hint: 'لا يُرسل لأي جهة غير Tuya، ويُحفظ في مخزن الجهاز الآمن',
      ),
      const CredentialField(
        key: keyUid,
        label: 'UID',
        type: CredentialFieldType.text,
        hint: 'من تبويب Devices ← Linked App Account',
      ),
      CredentialField(
        key: keyHost,
        label: 'مركز البيانات',
        type: CredentialFieldType.choice,
        hint: 'يجب أن يطابق ما اخترته عند إنشاء المشروع',
        defaultValue: TuyaDataCenter.centralEurope.host,
        options: [
          for (final dc in TuyaDataCenter.values)
            CredentialOption(value: dc.host, label: dc.labelAr, hint: dc.host),
        ],
      ),
    ],
  );

  /// المفاتيح التي لا يعمل التكامل بدونها.
  static const List<String> requiredKeys = [
    keyAccessId,
    keyAccessSecret,
    keyUid,
  ];
}

/// مسارات Tuya Cloud OpenAPI المستخدمة.
abstract final class TuyaPaths {
  static const String token = '/v1.0/token';

  static String userDevices(String uid) => '/v1.0/users/$uid/devices';
  static String device(String id) => '/v1.0/devices/$id';
  static String specifications(String id) => '/v1.0/devices/$id/specifications';
  static String status(String id) => '/v1.0/devices/$id/status';
  static String commands(String id) => '/v1.0/devices/$id/commands';
  static String logs(String id) => '/v1.0/devices/$id/logs';
}

abstract final class TuyaTuning {
  static const Duration requestTimeout = Duration(seconds: 20);

  /// نجدّد التوكن قبل انتهائه بهذا الهامش تفادياً لسباق الزمن.
  static const Duration tokenRefreshMargin = Duration(minutes: 5);

  /// نوع سجلّات «تقارير حالة الجهاز» في `/logs`.
  static const String reportLogType = '7';
}
