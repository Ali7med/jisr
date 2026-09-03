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

  factory CredentialOption.fromJson(Map<String, dynamic> json) =>
      CredentialOption(
        value: json['value'] as String? ?? '',
        label: json['label'] as String? ?? '',
        hint: json['hint'] as String?,
      );
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

  factory CredentialField.fromJson(Map<String, dynamic> json) =>
      CredentialField(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
        type: _typeFromWire(json['type'] as String?),
        hint: json['hint'] as String?,
        defaultValue: json['defaultValue'] as String?,
        required: json['required'] as bool? ?? true,
        options: [
          for (final option in (json['options'] as List? ?? const []))
            if (option is Map)
              CredentialOption.fromJson(Map<String, dynamic>.from(option)),
        ],
      );

  /// نوع حقل لا نعرفه يُعامَل نصّاً — أسوأ الأحوال حقل غير مُخفى، لا شاشة
  /// معطوبة تمنع ربط الحساب.
  static CredentialFieldType _typeFromWire(String? wire) => switch (wire) {
    'secret' => CredentialFieldType.secret,
    'choice' => CredentialFieldType.choice,
    _ => CredentialFieldType.text,
  };
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

  /// **هذه الدالة هي القاعدة الحاكمة 7 عملياً**: الشاشة تُبنى من وصف
  /// يرسله السيرفر، فشركة جديدة تظهر في التطبيق بلا تحديث له.
  factory IntegrationInfo.fromJson(Map<String, dynamic> json) =>
      IntegrationInfo(
        id: json['id'] as String? ?? '',
        nameAr: json['nameAr'] as String? ?? '',
        nameEn: json['nameEn'] as String? ?? '',
        description: json['description'] as String? ?? '',
        setupUrl: json['setupUrl'] as String?,
        supportsHistory: json['supportsHistory'] as bool? ?? false,
        supportsPairing: json['supportsPairing'] as bool? ?? false,
        fields: [
          for (final field in (json['fields'] as List? ?? const []))
            if (field is Map)
              CredentialField.fromJson(Map<String, dynamic>.from(field)),
        ],
      );

  @override
  String toString() => 'IntegrationInfo($id, $nameEn)';
}
