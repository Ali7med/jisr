import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// `show` مقصود: intl تُصدِّر أيضاً TextDirection وتتعارض مع نوع Flutter.
import 'package:intl/intl.dart' show DateFormat;
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device_state.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';
import 'package:jisr/ui/logs/view_models/logs_view_model.dart';
import 'package:jisr/utils/capability_format.dart';

/// رسم بياني لقراءة واحدة عبر الزمن.
class HistoryChartScreen extends ConsumerStatefulWidget {
  const HistoryChartScreen({
    super.key,
    required this.deviceId,
    required this.capability,
  });

  final String deviceId;
  final Capability capability;

  @override
  ConsumerState<HistoryChartScreen> createState() => _HistoryChartScreenState();
}

class _HistoryChartScreenState extends ConsumerState<HistoryChartScreen> {
  Duration _window = const Duration(days: 1);

  HistoryQuery get _query =>
      (deviceId: widget.deviceId, key: widget.capability.key, window: _window);

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(historyProvider(_query));

    return Scaffold(
      appBar: AppBar(title: Text(capabilityLabel(widget.capability.key))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: SegmentedButton<Duration>(
              segments: const [
                ButtonSegment(value: Duration(days: 1), label: Text(S.lastDay)),
                ButtonSegment(
                  value: Duration(days: 7),
                  label: Text(S.lastWeek),
                ),
              ],
              selected: {_window},
              showSelectedIcon: false,
              onSelectionChanged: (set) => setState(() => _window = set.first),
            ),
          ),
          Expanded(
            child: history.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => ErrorStateView(
                message: '$error',
                icon: Icons.error_outline,
                onRetry: () => ref.invalidate(historyProvider(_query)),
              ),
              data: (points) {
                final spots = _toSpots(points);
                // نقطة واحدة لا ترسم خطاً — نعامله كـ«لا بيانات».
                if (spots.length < 2) {
                  return const EmptyStateView(
                    icon: Icons.show_chart,
                    title: S.noHistory,
                  );
                }
                return Padding(
                  padding: const EdgeInsets.fromLTRB(8, 24, 24, 24),
                  child: _Chart(spots: spots, capability: widget.capability),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  /// نطبّق `scale` هنا كما في بقية الواجهة، حتى يتطابق الرقمان.
  List<FlSpot> _toSpots(List<HistoryPoint> points) => [
    for (final point in points)
      FlSpot(
        point.at.millisecondsSinceEpoch.toDouble(),
        widget.capability.toDisplay(point.value),
      ),
  ];
}

class _Chart extends StatelessWidget {
  const _Chart({required this.spots, required this.capability});

  final List<FlSpot> spots;
  final Capability capability;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final minX = spots.first.x;
    final maxX = spots.last.x;
    final span = maxX - minX;

    return LineChart(
      LineChartData(
        minX: minX,
        maxX: maxX,
        gridData: FlGridData(
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) =>
              FlLine(color: scheme.outlineVariant, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 46,
              getTitlesWidget: (value, meta) => Text(
                _short(value),
                style: theme.textTheme.bodySmall,
                textDirection: TextDirection.ltr,
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 30,
              // ثلاث علامات فقط: أول، وسط، آخر — أوضح من ازدحام التواريخ.
              interval: span > 0 ? span / 2 : null,
              getTitlesWidget: (value, meta) => Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  _timeLabel(value, span),
                  style: theme.textTheme.bodySmall,
                  textDirection: TextDirection.ltr,
                ),
              ),
            ),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => scheme.inverseSurface,
            getTooltipItems: (touched) => [
              for (final spot in touched)
                LineTooltipItem(
                  '${formatCapabilityValue(capability, capability.fromDisplay(spot.y))}'
                  '\n${_timeLabel(spot.x, span)}',
                  TextStyle(color: scheme.onInverseSurface),
                ),
            ],
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            preventCurveOverShooting: true,
            color: scheme.primary,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: scheme.primary.withValues(alpha: 0.12),
            ),
          ),
        ],
      ),
    );
  }

  String _short(double value) {
    if (value.abs() >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
    return value.toStringAsFixed(value == value.roundToDouble() ? 0 : 1);
  }

  /// نافذة اليوم تُعرض بالساعات، والأسبوع بالتواريخ.
  String _timeLabel(double millis, double span) {
    final time = DateTime.fromMillisecondsSinceEpoch(millis.toInt());
    final pattern = span > const Duration(days: 2).inMilliseconds
        ? 'MM/dd'
        : 'HH:mm';
    return DateFormat(pattern).format(time);
  }
}
