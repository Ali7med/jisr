import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/domain/models/scene.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';
import 'package:jisr/ui/devices/view_models/devices_view_model.dart';

/// المشاهد: نقرة واحدة تُرسل أوامر عدّة.
///
/// المشهد قد **ينجح جزئياً** — جهاز غير متصل لا يُلغي البقية. الشاشة تقول
/// أي خطوة فشلت ولماذا؛ «تم» فوق فشل صامت يفقد المستخدم ثقته بالتطبيق.
class ScenesScreen extends ConsumerStatefulWidget {
  const ScenesScreen({super.key});

  @override
  ConsumerState<ScenesScreen> createState() => _ScenesScreenState();
}

class _ScenesScreenState extends ConsumerState<ScenesScreen> {
  /// المشاهد الجاري تنفيذها — نقرة ثانية على مشهد يعمل لا تُرسل طلباً ثانياً.
  final _running = <String>{};

  @override
  Widget build(BuildContext context) {
    final scenes = ref.watch(scenesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(S.scenes),
        actions: [
          IconButton(
            tooltip: S.refresh,
            onPressed: () => ref.read(scenesProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: scenes.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : '$error',
          onRetry: () => ref.read(scenesProvider.notifier).refresh(),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyStateView(
              icon: Icons.auto_awesome_outlined,
              title: S.noScenes,
              hint: S.noScenesHint,
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.read(scenesProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, index) {
                final scene = list[index];
                return _SceneCard(
                  scene: scene,
                  running: _running.contains(scene.id),
                  onTap: () => _run(scene),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Future<void> _run(Scene scene) async {
    if (_running.contains(scene.id)) return;
    setState(() => _running.add(scene.id));

    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await ref.read(scenesProvider.notifier).run(scene.id);
      if (!mounted) return;

      if (result.allSucceeded) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              '${S.sceneDone} — ${result.succeeded} ${S.sceneStepsSummary}',
            ),
          ),
        );
      } else {
        await _showFailures(result);
      }
    } on ApiException catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text('${S.sceneRunFailed}: ${error.message}')),
      );
    } catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text('${S.sceneRunFailed}: $error')),
      );
    } finally {
      if (mounted) setState(() => _running.remove(scene.id));
    }
  }

  /// حوار لا شريط سفلي: قائمة الأعطال قد تكون عدّة أسطر، والشريط يختفي
  /// قبل أن يقرأها المستخدم.
  Future<void> _showFailures(SceneRunResult result) async {
    final devices = ref.read(devicesProvider).value?.devices ?? const [];
    final names = {for (final device in devices) device.id: device.name};

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(result.nothingRan ? S.sceneNothingRan : S.scenePartial),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              result.nothingRan ? S.sceneNothingRanHint : S.scenePartialHint,
            ),
            const SizedBox(height: 16),
            Text(
              S.sceneFailedSteps,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            for (final failure in result.failures)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  '${names[failure.deviceId] ?? failure.deviceId}: '
                  '${failure.message}',
                ),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text(S.close),
          ),
        ],
      ),
    );
  }
}

class _SceneCard extends StatelessWidget {
  const _SceneCard({
    required this.scene,
    required this.running,
    required this.onTap,
  });

  final Scene scene;
  final bool running;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Card(
      child: InkWell(
        onTap: running ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              _SceneIcon(icon: scene.icon),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      scene.name,
                      style: theme.textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      running
                          ? S.sceneRunning
                          : '${S.sceneStepsCount}: ${scene.steps.length}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: running ? scheme.primary : scheme.outline,
                      ),
                    ),
                  ],
                ),
              ),
              if (running)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(Icons.play_arrow_rounded, color: scheme.primary),
            ],
          ),
        ),
      ),
    );
  }
}

/// أيقونة المشهد.
///
/// السيرفر يرسل نصّاً حرّاً: قد يكون اسماً نعرفه، وقد يكون رمزاً تعبيرياً
/// اختاره المستخدم، وقد يكون شيئاً لا نفهمه. الثلاثة تُعرض — لا مشهد
/// يختفي لأن أيقونته غريبة (القاعدة الحاكمة 3).
class _SceneIcon extends StatelessWidget {
  const _SceneIcon({required this.icon});

  final String icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final known = _sceneIcons[icon];

    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: switch (known) {
        final IconData data => Icon(data, color: scheme.onSurfaceVariant),
        // نصّ غير معروف يُعرض كما هو: الرموز التعبيرية أشيع ما يضعه الناس.
        _ when icon.trim().isNotEmpty => Text(
          icon,
          style: const TextStyle(fontSize: 22),
          maxLines: 1,
          overflow: TextOverflow.clip,
        ),
        _ => Icon(Icons.auto_awesome_outlined, color: scheme.onSurfaceVariant),
      },
    );
  }
}

const Map<String, IconData> _sceneIcons = {
  'movie': Icons.movie_outlined,
  'night': Icons.bedtime_outlined,
  'sleep': Icons.bedtime_outlined,
  'morning': Icons.wb_twilight,
  'away': Icons.logout,
  'home': Icons.home_outlined,
  'party': Icons.celebration_outlined,
  'work': Icons.work_outline,
  'read': Icons.menu_book_outlined,
  'light': Icons.lightbulb_outline,
  'off': Icons.power_settings_new,
};
