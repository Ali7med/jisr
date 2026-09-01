import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/themes/app_theme.dart';
import 'package:jisr/ui/device_detail/widgets/device_detail_screen.dart';
import 'package:jisr/ui/devices/widgets/devices_screen.dart';
import 'package:jisr/ui/logs/widgets/logs_chart_screen.dart';
import 'package:jisr/ui/setup/widgets/account_form_screen.dart';
import 'package:jisr/ui/setup/widgets/integration_picker_screen.dart';

/// جذر التطبيق: الثيم، التعريب، والتنقّل.
class JisrApp extends StatelessWidget {
  const JisrApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: S.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const RootGate(),
    );
  }
}

/// تنقّل التطبيق.
///
/// الشاشات قليلة والانتقالات دائماً من الأب للابن، فـ [Navigator] المباشر
/// أبسط من موجّه كامل. لو نمت الشاشات أو احتجنا روابط عميقة، هذا هو الملف
/// الوحيد الذي يتغيّر.
abstract final class AppRoutes {
  static Future<void> toDeviceDetail(BuildContext context, String deviceId) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DeviceDetailScreen(deviceId: deviceId),
        ),
      );

  static Future<void> toHistory(
    BuildContext context, {
    required String deviceId,
    required Capability capability,
  }) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) =>
          HistoryChartScreen(deviceId: deviceId, capability: capability),
    ),
  );

  /// قائمة الشركات لربط حساب جديد.
  static Future<void> toIntegrationPicker(BuildContext context) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const IntegrationPickerScreen(),
        ),
      );

  /// نموذج ربط/تعديل حساب لتكامل معيّن.
  static Future<void> toAccountForm(
    BuildContext context, {
    required IntegrationInfo info,
    Account? existing,
  }) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => AccountFormScreen(info: info, existing: existing),
    ),
  );
}

/// يوجّه إلى ربط حساب أو قائمة الأجهزة، ويتتبّع دورة حياة التطبيق ليوقف
/// التحديث الدوري عند الانتقال للخلفية.
class RootGate extends ConsumerStatefulWidget {
  const RootGate({super.key});

  @override
  ConsumerState<RootGate> createState() => _RootGateState();
}

class _RootGateState extends ConsumerState<RootGate>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    ref.read(appActiveProvider.notifier).state =
        state == AppLifecycleState.resumed;
  }

  @override
  Widget build(BuildContext context) {
    final accounts = ref.watch(accountsProvider);

    return accounts.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      // فشل قراءة المخزن الآمن: نبدأ من الإعداد بدل شاشة خطأ مسدودة.
      error: (_, _) => const IntegrationPickerScreen(isFirstRun: true),
      data: (list) => list.isEmpty
          ? const IntegrationPickerScreen(isFirstRun: true)
          : const DevicesScreen(),
    );
  }
}
