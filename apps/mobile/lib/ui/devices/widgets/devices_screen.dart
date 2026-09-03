import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/routing/app_router.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
import 'package:jisr/ui/core/widgets/connection_banner.dart';
import 'package:jisr/ui/core/widgets/status_views.dart';
import 'package:jisr/ui/devices/view_models/devices_view_model.dart';
import 'package:jisr/ui/devices/widgets/device_card.dart';

class DevicesScreen extends ConsumerStatefulWidget {
  const DevicesScreen({super.key});

  @override
  ConsumerState<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends ConsumerState<DevicesScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final devices = ref.watch(devicesProvider);
    final accounts = ref.watch(accountsProvider).value ?? const <Account>[];
    final unread = ref.watch(unreadNotificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(S.devices),
        actions: [
          IconButton(
            tooltip: S.notifications,
            onPressed: () => AppRoutes.toNotifications(context),
            // الشارة تقرأ العدّاد الحيّ: إشعار يصل والتطبيق مفتوح يظهر
            // فوراً بلا فتح الشاشة.
            icon: Badge.count(
              count: unread,
              isLabelVisible: unread > 0,
              child: const Icon(Icons.notifications_none),
            ),
          ),
          IconButton(
            tooltip: S.scenes,
            onPressed: () => AppRoutes.toScenes(context),
            icon: const Icon(Icons.auto_awesome_outlined),
          ),
          IconButton(
            tooltip: S.refresh,
            onPressed: () => ref.read(devicesProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh),
          ),
          PopupMenuButton<Object>(
            tooltip: S.accounts,
            icon: const Icon(Icons.manage_accounts_outlined),
            onSelected: _onMenu,
            itemBuilder: (_) => [
              // الأتمتة وربط حساب في القائمة لا كأيقونتين: شريط بخمس
              // أيقونات يزاحم عنوان الشاشة على هاتف ضيّق.
              const PopupMenuItem<Object>(
                value: _automations,
                child: ListTile(
                  leading: Icon(Icons.bolt_outlined),
                  title: Text(S.automations),
                ),
              ),
              const PopupMenuItem<Object>(
                value: _addAccount,
                child: ListTile(
                  leading: Icon(Icons.add_link),
                  title: Text(S.addAccount),
                ),
              ),
              const PopupMenuDivider(),
              for (final account in accounts)
                PopupMenuItem<Object>(
                  value: account,
                  child: ListTile(
                    leading: Icon(
                      account.needsAttention
                          ? Icons.error_outline
                          : Icons.hub_outlined,
                      color: account.needsAttention
                          ? Theme.of(context).colorScheme.error
                          : null,
                    ),
                    title: Text(account.label),
                    subtitle: Text(account.statusMessage),
                  ),
                ),
              const PopupMenuDivider(),
              const PopupMenuItem<Object>(
                value: _signOut,
                child: ListTile(
                  leading: Icon(Icons.logout),
                  title: Text(S.signOut),
                ),
              ),
            ],
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: S.searchDevices,
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                      ),
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
        ),
      ),
      body: devices.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: '$error',
          onRetry: () => ref.read(devicesProvider.notifier).refresh(),
        ),
        data: (view) {
          final all = view.devices;
          if (all.isEmpty) {
            return const EmptyStateView(
              icon: Icons.devices_other,
              title: S.noDevices,
              hint: S.noDevicesHint,
            );
          }

          final filtered = _filter(all);
          if (filtered.isEmpty) {
            return const EmptyStateView(
              icon: Icons.search_off,
              title: S.noSearchResults,
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.read(devicesProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                ConnectionBanner(staleSince: view.staleSince),
                // حساب رفضته الشركة يظهر تنبيهاً بدل أن يكتشف المستخدم
                // العطل حين لا يستجيب جهازه.
                for (final account in accounts.where((a) => a.needsAttention))
                  NoticeBanner(
                    message: '${account.label}: ${account.statusMessage}',
                    margin: const EdgeInsets.only(top: 12),
                  ),
                const SizedBox(height: 12),
                ..._buildGroups(context, filtered),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Device> _filter(List<Device> devices) {
    final needle = _query.trim().toLowerCase();
    if (needle.isEmpty) return devices;

    return devices
        .where(
          (d) =>
              d.name.toLowerCase().contains(needle) ||
              d.groupLabel.toLowerCase().contains(needle) ||
              d.productName.toLowerCase().contains(needle),
        )
        .toList();
  }

  /// تجميع حسب الغرفة إن وفّرها التكامل، وإلا حسب الفئة.
  List<Widget> _buildGroups(BuildContext context, List<Device> devices) {
    final groups = <String, List<Device>>{};
    for (final device in devices) {
      groups.putIfAbsent(device.groupLabel, () => []).add(device);
    }

    for (final list in groups.values) {
      list.sort((a, b) {
        if (a.online != b.online) return a.online ? -1 : 1;
        return a.name.compareTo(b.name);
      });
    }

    final titles = groups.keys.toList()..sort();

    return [
      for (var i = 0; i < titles.length; i++) ...[
        SectionHeader(
          title: titles[i],
          count: groups[titles[i]]!.length,
          padding: EdgeInsets.fromLTRB(0, i == 0 ? 0 : 20, 0, 10),
        ),
        for (final device in groups[titles[i]]!) ...[
          DeviceCard(
            device: device,
            onTap: () => AppRoutes.toDeviceDetail(context, device.id),
          ),
          const SizedBox(height: 10),
        ],
      ],
    ];
  }

  Future<void> _onMenu(Object selection) async {
    if (selection == _signOut) return _confirmSignOut();
    if (selection == _automations) return AppRoutes.toAutomations(context);
    if (selection == _addAccount) {
      return AppRoutes.toIntegrationPicker(context);
    }
    if (selection is Account) return _openAccount(selection);
  }

  Future<void> _openAccount(Account account) async {
    final integrations = await ref.read(integrationsProvider.future);
    final info = integrations
        .where((candidate) => candidate.id == account.integrationId)
        .firstOrNull;
    if (info == null || !mounted) return;

    await AppRoutes.toAccountForm(context, info: info, existing: account);
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(S.signOut),
        content: const Text(S.signOutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text(S.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(S.signOut),
          ),
        ],
      ),
    );

    if (confirmed ?? false) {
      await ref.read(sessionProvider.notifier).logout();
    }
  }
}

/// قيم حارسة تميّز أوامر القائمة عن عناصر الحسابات فيها.
const Object _signOut = 'sign-out';
const Object _automations = 'automations';
const Object _addAccount = 'add-account';
