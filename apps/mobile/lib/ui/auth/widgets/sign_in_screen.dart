import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/api/api_exception.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';

/// شاشة الدخول — **بديل شاشة مفاتيح Tuya** (P3.4).
///
/// الهاتف لم يعد يعرف أي شركة ولا يحمل أي سرّ تكامل: ما يحتاجه المستخدم
/// هنا حساب واحد على جسر ([ADR-0009]).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();

  bool _registering = false;
  bool _busy = false;
  bool _hidden = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final notifier = ref.read(sessionProvider.notifier);
      if (_registering) {
        await notifier.register(
          email: _email.text.trim(),
          password: _password.text,
          displayName: _name.text.trim(),
        );
      } else {
        await notifier.login(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on ApiException catch (error) {
      // الرسالة عربية وكتبها السيرفر — نعرضها كما هي.
      if (mounted) setState(() => _error = error.message);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.hub_rounded,
                    size: 56,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    S.appName,
                    style: theme.textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    S.signInTagline,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  if (_registering) ...[
                    TextFormField(
                      controller: _name,
                      enabled: !_busy,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: S.displayName,
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (value) =>
                          (value ?? '').trim().isEmpty ? S.required : null,
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    controller: _email,
                    enabled: !_busy,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    textDirection: TextDirection.ltr,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: S.email,
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                    validator: (value) {
                      final text = (value ?? '').trim();
                      if (text.isEmpty) return S.required;
                      // فحص خفيف: التحقّق الحقيقي عند السيرفر
                      return text.contains('@') && text.contains('.')
                          ? null
                          : S.emailInvalid;
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _password,
                    enabled: !_busy,
                    obscureText: _hidden,
                    autocorrect: false,
                    enableSuggestions: false,
                    textDirection: TextDirection.ltr,
                    onFieldSubmitted: (_) => _busy ? null : _submit(),
                    decoration: InputDecoration(
                      labelText: S.password,
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _hidden = !_hidden),
                        icon: Icon(
                          _hidden
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    validator: (value) {
                      if ((value ?? '').isEmpty) return S.required;
                      // نفس حدّ السيرفر: نمنع رحلة ذهاب وإياب بلا فائدة
                      return _registering && value!.length < 10
                          ? S.passwordTooShort
                          : null;
                    },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    NoticeBanner(message: _error!, margin: EdgeInsets.zero),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(_registering ? S.signUp : S.signIn),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                            _registering = !_registering;
                            _error = null;
                          }),
                    child: Text(_registering ? S.haveAccount : S.noAccountYet),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
