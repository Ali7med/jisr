/// قيمة حالية لقدرة واحدة.
class StateValue {
  const StateValue({required this.key, required this.value});

  final String key;
  final Object? value;

  factory StateValue.fromJson(Map<String, dynamic> json) =>
      StateValue(key: json['key'] as String? ?? '', value: json['value']);

  @override
  String toString() => 'StateValue($key = $value)';
}

/// أمر تغيير قيمة قدرة.
class Command {
  const Command({required this.key, required this.value});

  final String key;
  final Object? value;

  @override
  String toString() => 'Command($key = $value)';
}

/// نقطة في سجلّ قراءة تاريخي.
class HistoryPoint {
  const HistoryPoint({
    required this.key,
    required this.value,
    required this.at,
  });

  final String key;

  /// القيمة **الخام** — تحويل `scale` يتم عند العرض كما في بقية الواجهة.
  final double value;

  final DateTime at;

  /// السيرفر يرسل الوقت بصيغة ISO-8601 بتوقيت UTC؛ نعرضه محلياً.
  factory HistoryPoint.fromJson(Map<String, dynamic> json) => HistoryPoint(
    key: json['key'] as String? ?? '',
    value: (json['value'] as num?)?.toDouble() ?? 0,
    at:
        DateTime.tryParse(json['at'] as String? ?? '')?.toLocal() ??
        DateTime.now(),
  );

  @override
  String toString() => 'HistoryPoint($key = $value @ $at)';
}
