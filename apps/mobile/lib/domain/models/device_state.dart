/// قيمة حالية لقدرة واحدة.
class StateValue {
  const StateValue({required this.key, required this.value});

  final String key;
  final Object? value;

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

  @override
  String toString() => 'HistoryPoint($key = $value @ $at)';
}
