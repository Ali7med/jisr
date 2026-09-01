import 'package:flutter/material.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/utils/capability_format.dart';

/// صف قراءة واحدة. قابل للنقر إن كانت رقمية — يفتح رسمها التاريخي.
class CapabilityReadingTile extends StatelessWidget {
  const CapabilityReadingTile({
    super.key,
    required this.capability,
    required this.value,
    this.onTap,
  });

  final Capability capability;
  final Object? value;
  final VoidCallback? onTap;

  /// الرسم البياني منطقي فقط للقيم الرقمية.
  bool get _isChartable => capability.kind == CapabilityKind.range;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListTile(
      onTap: _isChartable ? onTap : null,
      title: Text(capabilityLabel(capability.key)),
      subtitle: Text(
        capability.key,
        style: theme.textTheme.bodySmall,
        textDirection: TextDirection.ltr,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            formatCapabilityValue(capability, value),
            style: theme.textTheme.titleMedium,
          ),
          if (_isChartable && onTap != null) ...[
            const SizedBox(width: 4),
            Icon(Icons.show_chart, size: 18, color: theme.colorScheme.outline),
          ],
        ],
      ),
    );
  }
}
