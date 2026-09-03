import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/domain/models/automation.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/connection_banner.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';
import 'package:jisr/ui/devices/view_models/devices_view_model.dart';

/// الأتمتة — عرض فقط في هذا الإصدار.
///
/// الغاية الأولى للشاشة أن تجعل «لماذا لم تعمل أتمتتي؟» سؤالاً له جواب:
/// مُشغِّل مكتوب بالعربية، وحالة تشغيل ظاهرة، وسجلّ تنفيذ تحت كل أتمتة.
class AutomationsScreen extends ConsumerWidget {
  const AutomationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final automations = ref.watch(automationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(S.automations),
        actions: [
          IconButton(
            tooltip: S.refresh,
            onPressed: () => _refresh(ref),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: automations.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : '$error',
          onRetry: () => _refresh(ref),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyStateView(
              icon: Icons.bolt_outlined,
              title: S.noAutomations,
              hint: S.noAutomationsHint,
            );
          }

          // أسماء الأجهزة تجعل المُشغِّل جملة مفهومة بدل معرّف مركّب.
          final devices = ref.watch(devicesProvider).value?.devices ?? const [];
          final names = {for (final device in devices) device.id: device.name};

          return RefreshIndicator(
            onRefresh: () async => _refresh(ref),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const _ReadOnlyNote(),
                const SizedBox(height: 12),
                for (final automation in list) ...[
                  _AutomationCard(automation: automation, deviceNames: names),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  /// السجلّات تُبطَل مع القائمة: قائمة محدّثة فوق سجلّ قديم تُضلّل.
  void _refresh(WidgetRef ref) {
    ref.invalidate(automationsProvider);
    ref.invalidate(automationRunsProvider);
  }
}

/// الشاشة للقراءة الآن — نقولها صراحةً بدل أن يبحث المستخدم عن زرّ إضافة.
class _ReadOnlyNote extends StatelessWidget {
  const _ReadOnlyNote();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.visibility_outlined, size: 20, color: scheme.outline),
          const SizedBox(width: 10),
          const Expanded(child: Text(S.automationsReadOnly)),
        ],
      ),
    );
  }
}

class _AutomationCard extends StatelessWidget {
  const _AutomationCard({required this.automation, required this.deviceNames});

  final Automation automation;
  final Map<String, String> deviceNames;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final lastRun = automation.lastRunAt;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 14),
        childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        title: Row(
          children: [
            Expanded(
              child: Text(
                automation.name,
                style: theme.textTheme.titleMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            _EnabledChip(enabled: automation.enabled),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                automation.trigger.describeArabic(
                  deviceName: (id) => deviceNames[id] ?? id,
                ),
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 4),
              Text(
                lastRun == null
                    ? S.automationNeverRan
                    : '${S.automationLastRun}: ${relativeArabic(lastRun)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.outline,
                ),
              ),
            ],
          ),
        ),
        // `ExpansionTile` لا يبني أبناءه قبل الفتح، فسجلّ التنفيذ يُطلب
        // للأتمتة التي يفتحها المستخدم وحدها.
        children: [_RunLog(automationId: automation.id)],
      ),
    );
  }
}

class _EnabledChip extends StatelessWidget {
  const _EnabledChip({required this.enabled});

  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = enabled ? scheme.primary : scheme.outline;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        enabled ? S.automationEnabled : S.automationDisabled,
        style: TextStyle(color: color, fontSize: 12),
      ),
    );
  }
}

class _RunLog extends ConsumerWidget {
  const _RunLog({required this.automationId});

  final String automationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final runs = ref.watch(automationRunsProvider(automationId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: S.automationRunLog,
          icon: Icons.history,
          padding: const EdgeInsets.fromLTRB(0, 4, 0, 8),
        ),
        runs.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: LinearProgressIndicator(),
          ),
          // فشل جلب السجلّ لا يُخفي الأتمتة نفسها — نقول ما جرى في سطر.
          error: (error, _) => Text(
            error is ApiException ? error.message : '$error',
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.error),
          ),
          data: (list) => list.isEmpty
              ? Text(
                  S.automationNoRuns,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.outline,
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [for (final run in list) _RunRow(run: run)],
                ),
        ),
      ],
    );
  }
}

class _RunRow extends StatelessWidget {
  const _RunRow({required this.run});

  final AutomationRun run;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final color = run.succeeded ? scheme.primary : scheme.error;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            run.succeeded ? Icons.check_circle_outline : Icons.error_outline,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${run.succeeded ? S.automationRunSucceeded : S.automationRunFailed} · '
                  '${relativeArabic(run.ranAt)}',
                  style: theme.textTheme.bodySmall?.copyWith(color: color),
                ),
                if (run.detail.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(run.detail, style: theme.textTheme.bodySmall),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
