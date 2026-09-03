import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/capability.dart';
import 'package:jisr/domain/models/integration_info.dart';
import 'package:jisr/ui/auth/widgets/sign_in_screen.dart';
import 'package:jisr/ui/automations/widgets/automations_screen.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/themes/app_theme.dart';
import 'package:jisr/ui/device_detail/widgets/device_detail_screen.dart';
import 'package:jisr/ui/devices/widgets/devices_screen.dart';
import 'package:jisr/ui/logs/widgets/logs_chart_screen.dart';
import 'package:jisr/ui/notifications/widgets/notifications_screen.dart';
import 'package:jisr/ui/scenes/widgets/scenes_screen.dart';
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

  static Future<void> toScenes(BuildContext context) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => const ScenesScreen()));

  static Future<void> toNotifications(BuildContext context) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()));

  static Future<void> toAutomations(BuildContext context) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => const AutomationsScreen()));

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

/// يوجّه إلى الدخول أو إلى قائمة الأجهزة.
///
/// لا مراقبة لدورة حياة التطبيق بعد P3.5: لم يعد هناك استقصاء دوري
/// نوقفه في الخلفية — التحديثات تصل عبر القناة اللحظية.
class RootGate extends ConsumerWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);

    return session.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      // فشل قراءة المخزن الآمن: نبدأ من الدخول بدل شاشة خطأ مسدودة.
      error: (_, _) => const SignInScreen(),
      data: (value) =>
          value == null ? const SignInScreen() : const DevicesScreen(),
    );
  }
}
