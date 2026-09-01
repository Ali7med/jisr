import 'package:flutter/material.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';

/// أيقونة احتياطية لكل فئة — تُستخدم حين لا يوفّر التكامل صورة.
IconData iconForCategory(DeviceCategory category) => switch (category) {
  DeviceCategory.light => Icons.lightbulb_outline,
  DeviceCategory.switch_ => Icons.toggle_on_outlined,
  DeviceCategory.socket => Icons.power_outlined,
  DeviceCategory.sensor => Icons.sensors,
  DeviceCategory.climate => Icons.thermostat_outlined,
  DeviceCategory.fan => Icons.mode_fan_off_outlined,
  DeviceCategory.cover => Icons.blinds_outlined,
  DeviceCategory.lock => Icons.lock_outline,
  DeviceCategory.camera => Icons.videocam_outlined,
  DeviceCategory.energy => Icons.bolt_outlined,
  DeviceCategory.remote => Icons.settings_remote_outlined,
  DeviceCategory.other => Icons.devices_other,
};

class DeviceCard extends StatelessWidget {
  const DeviceCard({super.key, required this.device, required this.onTap});

  final Device device;
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
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              _DeviceIcon(device: device),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      device.name,
                      style: theme.textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _StatusDot(online: device.online),
                        const SizedBox(width: 6),
                        Text(
                          device.online ? S.online : S.offline,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: device.online
                                ? scheme.primary
                                : scheme.outline,
                          ),
                        ),
                        if (device.isSubDevice) ...[
                          const SizedBox(width: 10),
                          Icon(
                            Icons.hub_outlined,
                            size: 14,
                            color: scheme.outline,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left, color: scheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _DeviceIcon extends StatelessWidget {
  const _DeviceIcon({required this.device});

  final Device device;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fallback = Icon(
      iconForCategory(device.category),
      color: scheme.onSurfaceVariant,
    );
    final url = device.iconUrl;

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: Opacity(
        opacity: device.online ? 1 : 0.45,
        child: (url == null || url.isEmpty)
            ? fallback
            : Image.network(
                url,
                fit: BoxFit.contain,
                // صور الشركات قد تفشل بلا إنترنت أو لروابط قديمة.
                errorBuilder: (_, _, _) => fallback,
              ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.online});

  final bool online;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: online ? scheme.primary : scheme.outlineVariant,
      ),
    );
  }
}
