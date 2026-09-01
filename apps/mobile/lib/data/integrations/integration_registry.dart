import 'package:jisr/data/integrations/tuya/tuya_config.dart';
import 'package:jisr/data/integrations/tuya/tuya_integration.dart';
import 'package:jisr/domain/integration.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/integration_info.dart';

/// سجلّ كل التكاملات التي يعرفها التطبيق.
///
/// **هذا هو المكان الوحيد الذي يُذكر فيه اسم شركة.**
/// إضافة شركة جديدة = ثلاث خطوات فقط:
/// 1. مجلّد تحت `data/integrations/<name>/` فيه صنف يحقّق [Integration].
/// 2. بطاقة [IntegrationInfo] تصف حقول اعتماده.
/// 3. سطر واحد في [_entries] أدناه.
///
/// لا شاشة جديدة، ولا تعديل على المستودعات أو نماذج العرض.
abstract final class IntegrationRegistry {
  static final List<_Entry> _entries = [
    _Entry(TuyaConfig.info, TuyaIntegration.create),
  ];

  /// بطاقات كل التكاملات المتاحة — تُعرض في شاشة «إضافة شركة».
  static List<IntegrationInfo> get available =>
      _entries.map((e) => e.info).toList();

  static IntegrationInfo? infoFor(String integrationId) {
    for (final entry in _entries) {
      if (entry.info.id == integrationId) return entry.info;
    }
    return null;
  }

  /// يُنشئ تكاملاً لحساب محفوظ.
  ///
  /// يُرجع `null` لحساب يشير إلى تكامل لم يعد موجوداً — نتجاهله بدل
  /// إسقاط التطبيق، لأن الحسابات تُقرأ من تخزين قد يسبق تحديث التطبيق.
  static Integration? create(Account account) {
    for (final entry in _entries) {
      if (entry.info.id == account.integrationId) {
        return entry.factory(account);
      }
    }
    return null;
  }
}

class _Entry {
  const _Entry(this.info, this.factory);

  final IntegrationInfo info;
  final IntegrationFactory factory;
}
