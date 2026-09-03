import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/api/realtime_client.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';

/// شريط يقول الحقيقة عن حالة الاتصال ([ADR-0014] · P3.6).
///
/// شاشة تبدو حيّة وهي مقطوعة أسوأ من شاشة تقول إنها مقطوعة: المستخدم
/// يضغط مفتاحاً، لا يحدث شيء، ويظنّ العطل في جهازه.
class ConnectionBanner extends ConsumerWidget {
  const ConnectionBanner({super.key, this.staleSince});

  /// وقت آخر بيانات معروفة، إن كنّا نعرض من الكاش.
  final DateTime? staleSince;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(connectionStatusProvider).value;
    if (status == RealtimeStatus.connected && staleSince == null) {
      return const SizedBox.shrink();
    }

    final scheme = Theme.of(context).colorScheme;
    final connecting = status == RealtimeStatus.connecting;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: connecting
            ? scheme.surfaceContainerHighest
            : scheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            connecting ? Icons.sync : Icons.cloud_off,
            size: 20,
            color: connecting
                ? scheme.onSurfaceVariant
                : scheme.onErrorContainer,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  connecting ? S.reconnecting : S.offlineTitle,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: connecting
                        ? scheme.onSurfaceVariant
                        : scheme.onErrorContainer,
                  ),
                ),
                if (staleSince != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${S.offlineControlsDisabled} آخر تحديث ${relativeArabic(staleSince!)}.',
                    style: TextStyle(
                      color: connecting
                          ? scheme.onSurfaceVariant
                          : scheme.onErrorContainer,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// «قبل ٧ دقائق» — طابع زمني يفهمه إنسان، لا ISO-8601.
String relativeArabic(DateTime at) {
  final elapsed = DateTime.now().difference(at);

  if (elapsed.inSeconds < 60) return 'قبل لحظات';
  if (elapsed.inMinutes < 60) return 'قبل ${elapsed.inMinutes} دقيقة';
  if (elapsed.inHours < 24) return 'قبل ${elapsed.inHours} ساعة';
  return 'قبل ${elapsed.inDays} يوم';
}
