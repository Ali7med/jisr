import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/data/integrations/integration_registry.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/routing/app_router.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';

/// قائمة الشركات المدعومة.
///
/// تُبنى من [IntegrationRegistry] — إضافة شركة جديدة تظهر هنا تلقائياً.
class IntegrationPickerScreen extends ConsumerWidget {
  const IntegrationPickerScreen({super.key, this.isFirstRun = false});

  /// أول تشغيل: نعرض ترويسة ترحيبية ولا نعرض زر رجوع.
  final bool isFirstRun;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final integrations = IntegrationRegistry.available;

    return Scaffold(
      appBar: AppBar(
        title: Text(isFirstRun ? S.appName : S.chooseIntegration),
        automaticallyImplyLeading: !isFirstRun,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (isFirstRun) ...[
            const SizedBox(height: 8),
            Text(
              S.appTagline,
              style: theme.textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              S.noAccountsHint,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.outline,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
          ],
          for (final info in integrations) ...[
            _IntegrationCard(
              info: info,
              onTap: () => AppRoutes.toAccountForm(context, info: info),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _IntegrationCard extends StatelessWidget {
  const _IntegrationCard({required this.info, required this.onTap});

  final IntegrationInfo info;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.hub_outlined, color: scheme.primary),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(info.nameAr, style: theme.textTheme.titleMedium),
                        Text(
                          info.nameEn,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: scheme.outline,
                          ),
                          textDirection: TextDirection.ltr,
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_left, color: scheme.outline),
                ],
              ),
              const SizedBox(height: 12),
              Text(info.description, style: theme.textTheme.bodySmall),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (info.supportsHistory)
                    _Chip(icon: Icons.show_chart, label: S.supportsHistory),
                  if (!info.supportsPairing)
                    _Chip(
                      icon: Icons.phonelink_setup_outlined,
                      label: S.noPairing,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: scheme.onSurfaceVariant),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
