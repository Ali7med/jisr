/// مشهد: مجموعة أوامر تُنفَّذ بنقرة واحدة.
///
/// المشهد **عابر للشركات بطبيعته**: الخطوة تُوجَّه بمعرّف الجهاز المركّب
/// لا بمعرّف شركة، فمشهد واحد يطفئ مصباحاً ويشغّل مقبساً من مصدر آخر.
/// الهاتف لا يعرف أياً من ذلك — يعرض ما يصله من السيرفر ([ADR-0009]).
class Scene {
  const Scene({
    required this.id,
    required this.name,
    required this.icon,
    required this.steps,
    required this.createdAt,
  });

  final String id;
  final String name;

  /// نصّ حرّ من السيرفر: قد يكون اسم أيقونة معروفاً أو رمزاً تعبيرياً.
  /// الواجهة تختار الشكل ولا تفترض شيئاً — نصّ لا نفهمه لا يُخفي المشهد.
  final String icon;

  final List<SceneStep> steps;
  final DateTime createdAt;

  factory Scene.fromJson(Map<String, dynamic> json) => Scene(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? 'مشهد بلا اسم',
    icon: json['icon'] as String? ?? '',
    steps: [
      for (final step in (json['steps'] as List? ?? const []))
        if (step is Map) SceneStep.fromJson(Map<String, dynamic>.from(step)),
    ],
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ??
        DateTime.now(),
  );

  @override
  String toString() => 'Scene($id, "$name", ${steps.length} steps)';
}

/// خطوة واحدة: قيمة تُرسل لقدرة على جهاز.
class SceneStep {
  const SceneStep({
    required this.deviceId,
    required this.key,
    required this.value,
  });

  final String deviceId;
  final String key;
  final Object? value;

  factory SceneStep.fromJson(Map<String, dynamic> json) => SceneStep(
    deviceId: json['deviceId'] as String? ?? '',
    key: json['key'] as String? ?? '',
    value: json['value'],
  );

  @override
  String toString() => 'SceneStep($deviceId.$key = $value)';
}

/// نتيجة تشغيل مشهد.
///
/// **النجاح الجزئي حقيقة لا استثناء**: جهاز واحد غير متصل لا يُلغي بقية
/// الخطوات، والواجهة ملزَمة بقول أي خطوة فشلت ولماذا بدل ادّعاء نجاح.
class SceneRunResult {
  const SceneRunResult({
    required this.sceneId,
    required this.succeeded,
    required this.failed,
    required this.failures,
    required this.at,
  });

  final String sceneId;
  final int succeeded;
  final int failed;
  final List<SceneFailure> failures;
  final DateTime at;

  bool get allSucceeded => failed == 0;

  /// لا خطوة نجحت — تُقال للمستخدم صراحةً، لا كـ«نجاح جزئي».
  bool get nothingRan => succeeded == 0 && failed > 0;

  bool get partial => succeeded > 0 && failed > 0;

  factory SceneRunResult.fromJson(Map<String, dynamic> json) => SceneRunResult(
    sceneId: json['sceneId'] as String? ?? '',
    succeeded: (json['succeeded'] as num?)?.toInt() ?? 0,
    failed: (json['failed'] as num?)?.toInt() ?? 0,
    failures: [
      for (final failure in (json['failures'] as List? ?? const []))
        if (failure is Map)
          SceneFailure.fromJson(Map<String, dynamic>.from(failure)),
    ],
    at:
        DateTime.tryParse(json['at'] as String? ?? '')?.toLocal() ??
        DateTime.now(),
  );

  @override
  String toString() => 'SceneRunResult($sceneId, +$succeeded / -$failed)';
}

/// خطوة لم تُنفَّذ، ورسالة السيرفر عن السبب كما هي.
class SceneFailure {
  const SceneFailure({required this.deviceId, required this.message});

  final String deviceId;
  final String message;

  factory SceneFailure.fromJson(Map<String, dynamic> json) => SceneFailure(
    deviceId: json['deviceId'] as String? ?? '',
    // رسالة فارغة تترك المستخدم بلا سبب؛ نضع جملة تقول له ما العمل.
    message: switch (json['message']) {
      final String text when text.trim().isNotEmpty => text,
      _ => 'تعذّر تنفيذ هذه الخطوة — تحقّق من اتصال الجهاز.',
    },
  );

  @override
  String toString() => 'SceneFailure($deviceId: $message)';
}
