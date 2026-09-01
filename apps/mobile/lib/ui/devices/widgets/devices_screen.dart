import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jisr/config/dependencies.dart';
import 'package:jisr/data/integrations/integration_registry.dart';
import 'package:jisr/domain/models/account.dart';
import 'package:jisr/domain/models/device.dart';
import 'package:jisr/routing/app_router.dart';
import 'package:jisr/ui/core/l10n/app_strings.dart';
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
    final failures = ref.watch(deviceRepositoryProvider).lastErrors;

    return Scaffold(
      appBar: AppBar(
        title: const Text(S.devices),
        actions: [
          IconButton(
            tooltip: S.addAccount,
            onPressed: () => AppRoutes.toIntegrationPicker(context),
            icon: const Icon(Icons.add_link),
          ),
          IconButton(
            tooltip: S.refresh,
            onPressed: () => ref.read(devicesProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh),
          ),
          PopupMenuButton<Account>(
            tooltip: S.accounts,
            icon: const Icon(Icons.manage_accounts_outlined),
            onSelected: _openAccount,
            itemBuilder: (_) => [
              for (final account in accounts)
                PopupMenuItem(
                  value: account,
                  child: ListTile(
                    leading: const Icon(Icons.hub_outlined),
                    title: Text(account.label),
                    subtitle: Text(
                      IntegrationRegistry.infoFor(
                            account.integrationId,
                          )?.nameAr ??
                          account.integrationId,
                    ),
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
        data: (all) {
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
                // تكامل واحد معطّل لا يُخفي أجهزة البقية، لكن لا يُبتلع صامتاً.
                if (failures.isNotEmpty)
                  NoticeBanner(
                    message:
                        '${S.someIntegrationsFailed}: '
                        '${failures.values.first.message}',
                    icon: Icons.cloud_off,
                    margin: const EdgeInsets.only(bottom: 12),
                  ),
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

  Future<void> _openAccount(Account account) async {
    final info = IntegrationRegistry.infoFor(account.integrationId);
    if (info == null || !mounted) return;

    await AppRoutes.toAccountForm(context, info: info, existing: account);
  }
}
