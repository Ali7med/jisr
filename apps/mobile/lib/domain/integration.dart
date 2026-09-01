import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/domain/models/device_state.dart';
import 'package:jisr/domain/models/integration_info.dart';

/// عقد التكامل مع شركة واحدة.
///
/// **هذا هو محور المشروع.** كل شركة — Tuya، Tasmota، Broadlink، Shelly —
/// تُنفَّذ كصنف واحد يحقّق هذه الواجهة، ولا شيء فوقها يعرف اسم الشركة:
/// المستودعات ونماذج العرض والشاشات تتعامل مع [Integration] فقط.
///
/// **مسؤولية المنفِّذ:**
/// 1. التحدّث ببروتوكول الشركة (HTTP، MQTT، UDP…).
/// 2. **الترجمة** إلى نماذج المجال: [Device] و[Capability] و[StateValue].
/// 3. رمي استثناءات برسائل عربية جاهزة للعرض.
///
/// **ما لا يفعله:** لا يعرف Widgets، ولا يخزّن حالة تخصّ الواجهة،
/// ولا يقرّر متى يُحدَّث (ذلك للمستودع ونماذج العرض).
abstract interface class Integration {
  /// بطاقة التعريف — تُبنى منها شاشة إضافة الحساب.
  IntegrationInfo get info;

  /// الحساب الذي يخدمه هذا المثيل.
  Account get account;

  /// يتحقّق من الاعتمادات ويهيّئ الاتصال.
  ///
  /// يرمي عند فشل المصادقة برسالة تشرح السبب والحل.
  Future<void> verify();

  /// كل أجهزة هذا الحساب، مترجَمة إلى نماذج المجال.
  Future<List<Device>> fetchDevices();

  /// قدرات جهاز واحد — ما يمكن قراءته والتحكم به.
  ///
  /// [nativeId] هو معرّف الشركة، لا [Device.id] العام.
  Future<List<Capability>> fetchCapabilities(String nativeId);

  /// القيم الحالية لجهاز.
  Future<List<StateValue>> fetchState(String nativeId);

  /// تنفيذ أوامر تحكّم.
  Future<void> execute(String nativeId, List<Command> commands);

  /// سجلّ تاريخي لقراءات محدّدة.
  ///
  /// تكامل لا يدعمه ([IntegrationInfo.supportsHistory] بـ `false`)
  /// يُرجع قائمة فارغة بدل أن يرمي.
  Future<List<HistoryPoint>> fetchHistory(
    String nativeId, {
    required List<String> keys,
    required DateTime start,
    required DateTime end,
    int limit,
  });

  /// يُغلق الموارد (اتصالات، مؤقّتات).
  void dispose();
}

/// دالة تُنشئ تكاملاً من حساب — تُسجَّل في سجلّ التكاملات.
typedef IntegrationFactory = Integration Function(Account account);
