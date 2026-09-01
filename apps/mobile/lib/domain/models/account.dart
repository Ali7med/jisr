/// حساب مرتبط بتكامل معيّن.
///
/// المستخدم قد يربط أكثر من حساب لنفس الشركة (بيت وبيت العائلة مثلاً)،
/// ولذلك [id] مستقلّ عن [integrationId].
class Account {
  const Account({
    required this.id,
    required this.integrationId,
    required this.label,
    required this.credentials,
  });

  /// معرّف فريد للحساب داخل التطبيق.
  final String id;

  /// أي تكامل يخدم هذا الحساب — `tuya` مثلاً.
  final String integrationId;

  /// اسم يعرضه المستخدم — «بيتي» أو «المكتب».
  final String label;

  /// قيم حقول الاعتماد، بالمفاتيح المعرّفة في `IntegrationInfo.fields`.
  ///
  /// ⚠️ تحوي أسراراً. تُخزَّن في `flutter_secure_storage` فقط،
  /// و[toString] لا يطبعها.
  final Map<String, String> credentials;

  String? operator [](String key) => credentials[key];

  /// هل كل الحقول المطلوبة معبّأة؟ يفحصها التكامل بقائمة مفاتيحه.
  bool hasAll(Iterable<String> requiredKeys) =>
      requiredKeys.every((key) => (credentials[key] ?? '').trim().isNotEmpty);

  Account copyWith({String? label, Map<String, String>? credentials}) =>
      Account(
        id: id,
        integrationId: integrationId,
        label: label ?? this.label,
        credentials: credentials ?? this.credentials,
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'integrationId': integrationId,
    'label': label,
    'credentials': credentials,
  };

  factory Account.fromJson(Map<String, dynamic> json) => Account(
    id: json['id'] as String? ?? '',
    integrationId: json['integrationId'] as String? ?? '',
    label: json['label'] as String? ?? '',
    credentials: Map<String, String>.from(
      (json['credentials'] as Map?) ?? const {},
    ),
  );

  /// لا يطبع الاعتمادات أبداً.
  @override
  String toString() => 'Account($id, $integrationId, "$label")';
}
