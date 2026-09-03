import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/device_snapshot.dart';
import 'package:jisr/routing/app_router.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/connection_banner.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';
import 'package:jisr/ui/device_detail/view_models/device_detail_view_model.dart';
import 'package:jisr/ui/device_detail/widgets/capability_control_tile.dart';
import 'package:jisr/ui/device_detail/widgets/capability_reading_tile.dart';

/// تفاصيل جهاز — كل محتواها مبني من قدرات الجهاز، لا من نوعه ولا من شركته.
class DeviceDetailScreen extends ConsumerWidget {
  const DeviceDetailScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(deviceDetailProvider(deviceId));

    return Scaffold(
      appBar: AppBar(
        title: Text(detail.value?.device.name ?? S.loading),
        actions: [
          IconButton(
            tooltip: S.refresh,
            onPressed: () =>
                ref.read(deviceDetailProvider(deviceId).notifier).refresh(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          icon: Icons.error_outline,
          message: error is ApiException ? error.message : '$error',
          onRetry: () =>
              ref.read(deviceDetailProvider(deviceId).notifier).refresh(),
        ),
        data: (snapshot) => _DetailBody(
          snapshot: snapshot,
          onCommand: (key, value) => _send(context, ref, key, value),
        ),
      ),
    );
  }

  Future<void> _send(
    BuildContext context,
    WidgetRef ref,
    String key,
    Object? value,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(deviceDetailProvider(deviceId).notifier)
          .sendCommand(key, value);
    } on ApiException catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text('${S.commandFailed}: ${error.message}')),
      );
    } catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text('${S.commandFailed}: $error')),
      );
    }
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.snapshot, required this.onCommand});

  final DeviceSnapshot snapshot;
  final void Function(String key, Object? value) onCommand;

  @override
  Widget build(BuildContext context) {
    final device = snapshot.device;
    final controls = snapshot.controls;
    final readings = snapshot.readings;

    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        ConnectionBanner(staleSince: snapshot.staleSince),
        if (!device.online)
          const NoticeBanner(
            message: S.deviceOfflineNotice,
            icon: Icons.cloud_off,
          ),
        SectionHeader(
          title: S.controls,
          icon: Icons.tune,
          count: controls.length,
        ),
        if (controls.isEmpty)
          const _Note(text: S.noControls)
        else
          for (final capability in controls)
            CapabilityControlTile(
              capability: capability,
              value: snapshot.values[capability.key],
              // جهاز غير متصل لن يستجيب، ولقطة من الكاش لا تُتحكَّم منها
              // ([ADR-0009] · P3.6): نعطّل بدل إيهام المستخدم.
              enabled: device.online && !snapshot.isStale,
              onChanged: (value) => onCommand(capability.key, value),
            ),
        const SizedBox(height: 8),
        SectionHeader(
          title: S.readings,
          icon: Icons.insights_outlined,
          count: readings.length,
        ),
        if (readings.isEmpty)
          const _Note(text: S.noReadings)
        else
          for (final capability in readings)
            CapabilityReadingTile(
              capability: capability,
              value: snapshot.values[capability.key],
              onTap: () => _openHistory(context, capability),
            ),
        const SizedBox(height: 16),
        _DeviceMeta(snapshot: snapshot),
      ],
    );
  }

  void _openHistory(BuildContext context, Capability capability) {
    AppRoutes.toHistory(
      context,
      deviceId: snapshot.device.id,
      capability: capability,
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        text,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.outline,
        ),
      ),
    );
  }
}

/// بيانات تعريفية مفيدة للتشخيص عند اختلاف سلوك جهاز.
class _DeviceMeta extends StatelessWidget {
  const _DeviceMeta({required this.snapshot});

  final DeviceSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final device = snapshot.device;

    final rows = <(String, String)>[
      // معرّف التكامل يظهر كما هو: الاسم العربي للشركة يعيش في السيرفر،
      // وسحبه هنا يحمّل شاشة تفاصيل طلب شبكة لا تستحقّه.
      ('الشركة', device.integrationId),
      ('المعرّف', device.nativeId),
      ('الفئة', device.category.labelAr),
      if (device.productName.isNotEmpty) ('المنتج', device.productName),
      if (device.model.isNotEmpty) ('الموديل', device.model),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (label, value) in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 80,
                    child: Text(
                      label,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.outline,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      value,
                      style: theme.textTheme.bodySmall,
                      textAlign: TextAlign.start,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
