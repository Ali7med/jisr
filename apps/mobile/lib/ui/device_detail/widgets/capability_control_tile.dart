import 'package:flutter/material.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/utils/capability_format.dart';

/// يختار الودجت المناسبة لقدرة حسب نوعها.
///
/// **لا يوجد أي مفتاح خاص بشركة مكتوب هنا** — كل شيء يأتي من [Capability]،
/// فأي جهاز من أي شركة يعمل فوراً بلا تعديل كود.
class CapabilityControlTile extends StatelessWidget {
  const CapabilityControlTile({
    super.key,
    required this.capability,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final Capability capability;
  final Object? value;
  final bool enabled;
  final void Function(Object? value) onChanged;

  @override
  Widget build(BuildContext context) {
    return switch (capability.kind) {
      CapabilityKind.toggle => _ToggleControl(
        capability: capability,
        value: value == true,
        enabled: enabled,
        onChanged: onChanged,
      ),
      CapabilityKind.range => _RangeControl(
        capability: capability,
        value: value,
        enabled: enabled,
        onChanged: onChanged,
      ),
      CapabilityKind.mode => _ModeControl(
        capability: capability,
        value: value,
        enabled: enabled,
        onChanged: onChanged,
      ),
      // نصوص وأنواع غير معروفة لا تُحرَّر بأمان من واجهة عامة.
      _ => _RawControl(capability: capability, value: value),
    };
  }
}

class _ToggleControl extends StatelessWidget {
  const _ToggleControl({
    required this.capability,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final Capability capability;
  final bool value;
  final bool enabled;
  final void Function(Object?) onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      title: Text(capabilityLabel(capability.key)),
      subtitle: Text(
        capability.key,
        style: Theme.of(context).textTheme.bodySmall,
        textDirection: TextDirection.ltr,
      ),
      value: value,
      onChanged: enabled ? onChanged : null,
    );
  }
}

/// منزلق بحالة محلية أثناء السحب: نرسل الأمر عند الإفلات فقط،
/// وإلا أرسلنا عشرات الأوامر واستهلكنا حصة الـ API.
class _RangeControl extends StatefulWidget {
  const _RangeControl({
    required this.capability,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final Capability capability;
  final Object? value;
  final bool enabled;
  final void Function(Object?) onChanged;

  @override
  State<_RangeControl> createState() => _RangeControlState();
}

class _RangeControlState extends State<_RangeControl> {
  double? _dragging;

  double get _currentDisplay {
    final raw = widget.value is num
        ? widget.value! as num
        : num.tryParse('${widget.value}') ?? widget.capability.min ?? 0;
    return widget.capability.toDisplay(raw);
  }

  @override
  Widget build(BuildContext context) {
    final capability = widget.capability;
    final theme = Theme.of(context);

    final min = capability.displayMin;
    final max = capability.displayMax;
    // قيمة خارج المدى المُعلن تُسقط Slider — نُقيّدها بدل الانهيار.
    final value = (_dragging ?? _currentDisplay).clamp(min, max);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  capabilityLabel(capability.key),
                  style: theme.textTheme.titleMedium,
                ),
              ),
              Text(
                formatCapabilityValue(
                  capability,
                  capability.fromDisplay(value),
                ),
                style: theme.textTheme.titleMedium?.copyWith(
                  color: theme.colorScheme.primary,
                ),
              ),
            ],
          ),
          Slider(
            value: value,
            min: min,
            max: max > min ? max : min + 1,
            divisions: capability.divisions,
            onChanged: widget.enabled
                ? (v) => setState(() => _dragging = v)
                : null,
            onChangeEnd: (v) {
              setState(() => _dragging = null);
              widget.onChanged(capability.fromDisplay(v));
            },
          ),
          Text(
            capability.key,
            style: theme.textTheme.bodySmall,
            textDirection: TextDirection.ltr,
          ),
        ],
      ),
    );
  }
}

class _ModeControl extends StatelessWidget {
  const _ModeControl({
    required this.capability,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final Capability capability;
  final Object? value;
  final bool enabled;
  final void Function(Object?) onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final options = capability.options;
    if (options.isEmpty) {
      return _RawControl(capability: capability, value: value);
    }

    final selected = options.contains('$value') ? '$value' : null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            capabilityLabel(capability.key),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 10),
          // ثلاثة خيارات أو أقل تُعرض كأزرار؛ أكثر من ذلك يضيق على الشاشة.
          if (options.length <= 3)
            SegmentedButton<String>(
              segments: [
                for (final option in options)
                  ButtonSegment(
                    value: option,
                    label: Text(optionLabel(option)),
                  ),
              ],
              selected: selected == null ? <String>{} : {selected},
              emptySelectionAllowed: true,
              showSelectedIcon: false,
              onSelectionChanged: enabled
                  ? (set) {
                      if (set.isNotEmpty) onChanged(set.first);
                    }
                  : null,
            )
          else
            DropdownButtonFormField<String>(
              initialValue: selected,
              items: [
                for (final option in options)
                  DropdownMenuItem(
                    value: option,
                    child: Text(optionLabel(option)),
                  ),
              ],
              onChanged: enabled
                  ? (v) {
                      if (v != null) onChanged(v);
                    }
                  : null,
            ),
          const SizedBox(height: 6),
          Text(
            capability.key,
            style: theme.textTheme.bodySmall,
            textDirection: TextDirection.ltr,
          ),
        ],
      ),
    );
  }
}

/// عرض خام لقدرة لا نعرف كيف نتحكم بها — أفضل من إخفائها.
class _RawControl extends StatelessWidget {
  const _RawControl({required this.capability, required this.value});

  final Capability capability;
  final Object? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListTile(
      title: Text(capabilityLabel(capability.key)),
      subtitle: Text(
        '${S.unsupportedCapability} $value',
        style: theme.textTheme.bodySmall,
      ),
      trailing: Icon(
        Icons.help_outline,
        color: theme.colorScheme.outlineVariant,
      ),
    );
  }
}
