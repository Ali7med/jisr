/// حساب مربوط كما يراه الهاتف.
///
/// **لا اعتمادات هنا.** بعد [ADR-0009] تعيش أسرار الشركات مشفّرة على
/// السيرفر وحده؛ الهاتف يرى تسمية وحالة وعدد أجهزة، ويرسل الاعتمادات مرة
/// واحدة عند الربط ولا يحتفظ بها.
class Account {
  const Account({
    required this.id,
    required this.integrationId,
    required this.label,
    required this.status,
    this.deviceCount = 0,
    this.credentialsExpireAt,
    this.lastCheckedAt,
  });

  final String id;
  final String integrationId;
  final String label;
  final AccountStatus status;
  final int deviceCount;

  /// انتهاء اشتراك المشروع لدى الشركة — عليه يعمل تنبيه الصلاحية.
  final DateTime? credentialsExpireAt;
  final DateTime? lastCheckedAt;

  /// هل يحتاج تدخّل المستخدم؟ يُعرض له تنبيه بدل أن يكتشف العطل حين لا
  /// يستجيب جهازه.
  bool get needsAttention => status != AccountStatus.active;

  /// رسالة عربية تشرح الحالة وما العمل.
  String get statusMessage => switch (status) {
    AccountStatus.active => 'يعمل',
    AccountStatus.invalidCredentials =>
      'رفضت الشركة بيانات هذا الحساب — أعد إدخالها.',
    AccountStatus.expired =>
      'انتهى اشتراك مشروعك لدى الشركة — جدّده ثم أعد المحاولة.',
    AccountStatus.disabled => 'الحساب موقوف.',
  };

  factory Account.fromJson(Map<String, dynamic> json) => Account(
    id: json['id'] as String? ?? '',
    integrationId: json['integrationId'] as String? ?? '',
    label: json['label'] as String? ?? '',
    status: _statusFromWire(json['status'] as String?),
    deviceCount: (json['deviceCount'] as num?)?.toInt() ?? 0,
    credentialsExpireAt: DateTime.tryParse(
      json['credentialsExpireAt'] as String? ?? '',
    )?.toLocal(),
    lastCheckedAt: DateTime.tryParse(
      json['lastCheckedAt'] as String? ?? '',
    )?.toLocal(),
  );

  static AccountStatus _statusFromWire(String? wire) => switch (wire) {
    'invalid_credentials' => AccountStatus.invalidCredentials,
    'expired' => AccountStatus.expired,
    'disabled' => AccountStatus.disabled,
    _ => AccountStatus.active,
  };

  @override
  String toString() => 'Account($id, $integrationId, "$label", ${status.name})';
}

enum AccountStatus { active, invalidCredentials, expired, disabled }
