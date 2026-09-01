/// نوع حقل اعتماد — تختاره الواجهة لبناء عنصر الإدخال المناسب.
enum CredentialFieldType {
  /// نص عادي (Access ID، عنوان IP).
  text,

  /// سرّ يُخفى أثناء الكتابة.
  secret,

  /// اختيار من قائمة ثابتة (مركز البيانات، المنطقة).
  choice,
}

/// خيار واحد في حقل من نوع [CredentialFieldType.choice].
class CredentialOption {
  const CredentialOption({required this.value, required this.label, this.hint});

  /// القيمة المخزَّنة.
  final String value;

  /// النص المعروض.
  final String label;

  /// سطر توضيحي تحت الخيار.
  final String? hint;
}

/// حقل واحد تحتاجه شاشة الإعداد لربط حساب.
///
/// **هذا ما يجعل إضافة شركة جديدة بلا شاشة جديدة:** التكامل يصف حقوله،
/// والواجهة تبنيها. Tuya تطلب 4 حقول، وTasmota قد تطلب عنوان IP فقط.
class CredentialField {
  const CredentialField({
    required this.key,
    required this.label,
    required this.type,
    this.hint,
    this.options = const [],
    this.defaultValue,
    this.required = true,
  });

  /// مفتاح التخزين داخل بيانات الحساب.
  final String key;

  final String label;
  final CredentialFieldType type;

  /// سطر مساعدة تحت الحقل — أين يجد المستخدم هذه القيمة.
  final String? hint;

  /// خيارات [CredentialFieldType.choice].
  final List<CredentialOption> options;

  final String? defaultValue;
  final bool required;
}

/// بطاقة تعريف تكامل: ما يظهر في قائمة «إضافة شركة» وما يحتاجه للاتصال.
class IntegrationInfo {
  const IntegrationInfo({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.description,
    required this.fields,
    this.setupUrl,
    this.supportsHistory = false,
    this.supportsPairing = false,
  });

  /// معرّف ثابت لا يتغيّر — يدخل في معرّفات الأجهزة (`tuya:abc`).
  /// **تغييره يُبطل كل الحسابات المحفوظة.**
  final String id;

  final String nameAr;
  final String nameEn;

  /// سطر أو سطران يشرحان ما يغطّيه هذا التكامل.
  final String description;

  /// الحقول المطلوبة لربط حساب.
  final List<CredentialField> fields;

  /// رابط دليل الحصول على الاعتمادات.
  final String? setupUrl;

  /// هل يوفّر سجلّاً تاريخياً للقراءات؟
  final bool supportsHistory;

  /// هل يدعم إقران أجهزة جديدة من داخل التطبيق؟
  final bool supportsPairing;

  @override
  String toString() => 'IntegrationInfo($id, $nameEn)';
}
