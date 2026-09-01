import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/integrations/integration_registry.dart';
import 'package:jisr/data/repositories/accounts_repository.dart';
import 'package:jisr/domain/integration_exception.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';

/// نموذج ربط حساب — **يُبنى بالكامل من [IntegrationInfo.fields]**.
///
/// لا يوجد أي حقل مكتوب يدوياً لأي شركة. إضافة شركة جديدة تعطيها هذه
/// الشاشة مجاناً، مهما اختلفت حقول اعتمادها.
class AccountFormScreen extends ConsumerStatefulWidget {
  const AccountFormScreen({super.key, required this.info, this.existing});

  final IntegrationInfo info;

  /// حساب موجود للتعديل، أو `null` لحساب جديد.
  final Account? existing;

  @override
  ConsumerState<AccountFormScreen> createState() => _AccountFormScreenState();
}

class _AccountFormScreenState extends ConsumerState<AccountFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _controllers = <String, TextEditingController>{};
  final _choices = <String, String>{};
  final _obscured = <String>{};

  late final TextEditingController _label;

  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();

    final existing = widget.existing;
    _label = TextEditingController(text: existing?.label ?? widget.info.nameAr);

    for (final field in widget.info.fields) {
      final value = existing?[field.key] ?? field.defaultValue ?? '';
      if (field.type == CredentialFieldType.choice) {
        _choices[field.key] = value;
      } else {
        _controllers[field.key] = TextEditingController(text: value);
        if (field.type == CredentialFieldType.secret) _obscured.add(field.key);
      }
    }
  }

  @override
  void dispose() {
    _label.dispose();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    final account = Account(
      id: widget.existing?.id ?? AccountsRepository.newId(widget.info.id),
      integrationId: widget.info.id,
      label: _label.text.trim().isEmpty
          ? widget.info.nameAr
          : _label.text.trim(),
      credentials: {
        for (final entry in _controllers.entries)
          entry.key: entry.value.text.trim(),
        for (final entry in _choices.entries) entry.key: entry.value,
      },
    );

    // نختبر بتكامل مؤقت ونتخلّص منه؛ التكامل الدائم يبنيه الـ provider.
    final probe = IntegrationRegistry.create(account);
    if (probe == null) {
      setState(() {
        _busy = false;
        _error = 'هذا التكامل غير متاح في هذه النسخة.';
      });
      return;
    }

    try {
      await probe.verify();
      if (!mounted) return;

      await ref.read(accountsProvider.notifier).save(account);
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(S.connectionOk)));
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on IntegrationException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      probe.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final info = widget.info;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existing == null ? S.addAccount : S.editAccount),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(info.nameAr, style: theme.textTheme.titleMedium),
              const SizedBox(height: 6),
              Text(info.description, style: theme.textTheme.bodySmall),
              if (info.setupUrl != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.open_in_new,
                      size: 14,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: SelectableText(
                        info.setupUrl!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.primary,
                        ),
                        textDirection: TextDirection.ltr,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 24),

              TextFormField(
                controller: _label,
                enabled: !_busy,
                decoration: const InputDecoration(
                  labelText: S.accountLabel,
                  helperText: S.accountLabelHint,
                  prefixIcon: Icon(Icons.label_outline),
                ),
              ),
              const SizedBox(height: 16),

              for (final field in info.fields) ...[
                _buildField(field),
                const SizedBox(height: 16),
              ],

              if (_error != null) ...[
                const SizedBox(height: 4),
                NoticeBanner(message: _error!, margin: EdgeInsets.zero),
              ],

              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_done_outlined),
                label: Text(_busy ? S.testing : S.testAndSave),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildField(CredentialField field) {
    if (field.type == CredentialFieldType.choice) {
      return DropdownButtonFormField<String>(
        initialValue: _choices[field.key]?.isEmpty ?? true
            ? null
            : _choices[field.key],
        decoration: InputDecoration(
          labelText: field.label,
          helperText: field.hint,
          prefixIcon: const Icon(Icons.public),
        ),
        items: [
          for (final option in field.options)
            DropdownMenuItem(
              value: option.value,
              child: Text(
                option.hint == null
                    ? option.label
                    : '${option.label} — ${option.hint}',
              ),
            ),
        ],
        onChanged: _busy
            ? null
            : (value) => setState(() => _choices[field.key] = value ?? ''),
        validator: (value) =>
            (field.required && (value ?? '').isEmpty) ? S.required : null,
      );
    }

    final isSecret = field.type == CredentialFieldType.secret;
    final hidden = _obscured.contains(field.key);

    return TextFormField(
      controller: _controllers[field.key],
      enabled: !_busy,
      obscureText: isSecret && hidden,
      autocorrect: false,
      enableSuggestions: !isSecret,
      // بيانات الاعتماد لاتينية دائماً، والاتجاه العربي يجعلها غير مقروءة.
      textDirection: TextDirection.ltr,
      decoration: InputDecoration(
        labelText: field.label,
        helperText: field.hint,
        prefixIcon: Icon(isSecret ? Icons.key_outlined : Icons.badge_outlined),
        suffixIcon: isSecret
            ? IconButton(
                onPressed: () => setState(
                  () => hidden
                      ? _obscured.remove(field.key)
                      : _obscured.add(field.key),
                ),
                icon: Icon(
                  hidden
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
              )
            : null,
      ),
      validator: (value) =>
          (field.required && (value ?? '').trim().isEmpty) ? S.required : null,
    );
  }
}
