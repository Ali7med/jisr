/// خطورة الإشعار — تحدّد لون البطاقة وأيقونتها.
enum NotificationSeverity {
  info('معلومة'),
  warning('تنبيه'),
  critical('حرج');

  const NotificationSeverity(this.labelAr);

  final String labelAr;
}

/// إشعار داخل التطبيق.
///
/// **الاسم `AppNotification` مقصود**: Flutter يعرّف `Notification` في
/// `widgets` (شجرة إبلاغ الأحداث)، واسمٌ مطابق يجعل كل شاشة تستورد
/// الاثنين مضطرّة لـ`hide` أو `as`.
///
/// الإشعار يصل لحظياً عبر القناة **ويبقى على السيرفر**: من كان هاتفه
/// مغلقاً حين وقع الحدث يجب أن يجده حين يفتحه.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.severity,
    required this.read,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String body;
  final NotificationSeverity severity;
  final bool read;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        severity: severityFromWire(json['severity'] as String?),
        read: json['read'] as bool? ?? false,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ??
            DateTime.now(),
      );

  /// خطورة لا نعرفها (سيرفر أحدث) تصير [NotificationSeverity.info]:
  /// الإشعار يظهر بلون هادئ بدل أن يختفي (القاعدة الحاكمة 3).
  static NotificationSeverity severityFromWire(String? wire) => switch (wire) {
    'warning' => NotificationSeverity.warning,
    'critical' => NotificationSeverity.critical,
    _ => NotificationSeverity.info,
  };

  AppNotification asRead() => AppNotification(
    id: id,
    title: title,
    body: body,
    severity: severity,
    read: true,
    createdAt: createdAt,
  );

  @override
  String toString() =>
      'AppNotification($id, ${severity.name}, read: $read, "$title")';
}

/// قائمة الإشعارات مع عدّاد غير المقروء.
///
/// العدّاد يأتي من السيرفر ولا يُحسب من القائمة: القائمة صفحة أحدث ما
/// وصل، والعدّاد قد يشمل ما لم يُجلب بعد.
class NotificationFeed {
  const NotificationFeed({required this.items, required this.unread});

  static const empty = NotificationFeed(items: [], unread: 0);

  final List<AppNotification> items;
  final int unread;

  /// إشعار وصل عبر القناة يتصدّر القائمة فوراً — الشارة يجب أن تتحرّك
  /// لحظة وقوع الحدث لا عند الجلب التالي.
  NotificationFeed withIncoming(AppNotification incoming) => NotificationFeed(
    items: [incoming, ...items],
    unread: incoming.read ? unread : unread + 1,
  );

  NotificationFeed allRead() => NotificationFeed(
    items: [for (final item in items) item.asRead()],
    unread: 0,
  );

  @override
  String toString() =>
      'NotificationFeed(${items.length} items, $unread unread)';
}
