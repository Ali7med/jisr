import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/domain/models/app_notification.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/connection_banner.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';

/// الإشعارات — ما وقع بينما لم يكن المستخدم ينظر.
///
/// القائمة تصل من السيرفر ويُضاف إليها الوارد على القناة لحظياً، فما يُرى
/// هنا هو نفسه ما تعدّه الشارة على شريط الأجهزة.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(notificationsProvider);
    final unread = feed.value?.unread ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text(S.notifications),
        actions: [
          IconButton(
            tooltip: S.markAllRead,
            // لا شيء لتعليمه: زرّ يعمل بلا أثر يربك أكثر مما يفيد.
            onPressed: unread == 0 ? null : () => _markAllRead(context, ref),
            icon: const Icon(Icons.done_all),
          ),
          IconButton(
            tooltip: S.refresh,
            onPressed: () => ref.read(notificationsProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: feed.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : '$error',
          onRetry: () => ref.read(notificationsProvider.notifier).refresh(),
        ),
        data: (data) {
          if (data.items.isEmpty) {
            return const EmptyStateView(
              icon: Icons.notifications_none,
              title: S.noNotifications,
              hint: S.noNotificationsHint,
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: data.items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (_, index) =>
                  _NotificationTile(notification: data.items[index]),
            ),
          );
        },
      ),
    );
  }

  Future<void> _markAllRead(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(notificationsProvider.notifier).markAllRead();
      messenger.showSnackBar(const SnackBar(content: Text(S.markAllReadDone)));
    } on ApiException catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text('${S.markAllReadFailed} (${error.message})')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text(S.markAllReadFailed)),
      );
    }
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tone = _toneFor(notification.severity, scheme);
    final unread = !notification.read;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        // غير المقروء بخلفية مميّزة: الفرق يجب أن يُرى بلمحة، لا أن
        // يُستنتج من ثقل الخطّ وحده.
        color: unread ? scheme.surfaceContainerHighest : scheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(tone.icon, color: tone.color, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notification.title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                if (notification.body.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(notification.body, style: theme.textTheme.bodyMedium),
                ],
                const SizedBox(height: 6),
                Text(
                  relativeArabic(notification.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.outline,
                  ),
                ),
              ],
            ),
          ),
          if (unread) ...[
            const SizedBox(width: 8),
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(top: 6),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: scheme.primary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// شكل الخطورة: أيقونة ولون. مجمّع هنا كي تتّفق الشارة والبطاقة.
({IconData icon, Color color}) _toneFor(
  NotificationSeverity severity,
  ColorScheme scheme,
) => switch (severity) {
  NotificationSeverity.info => (
    icon: Icons.info_outline,
    color: scheme.primary,
  ),
  NotificationSeverity.warning => (
    icon: Icons.warning_amber_rounded,
    color: scheme.tertiary,
  ),
  NotificationSeverity.critical => (
    icon: Icons.error_outline,
    color: scheme.error,
  ),
};
