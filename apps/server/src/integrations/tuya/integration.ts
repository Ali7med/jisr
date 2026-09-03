import type { Capability, Command, Device, HistoryPoint, StateValue } from '@jisr/shared';
import type { HistoryQuery, Integration, IntegrationContext } from '../types.ts';
import { createTuyaClient, type TuyaClient } from './client.ts';
import {
  dataCenterFromHost,
  TUYA_INFO,
  TUYA_KEY_ACCESS_ID,
  TUYA_KEY_ACCESS_SECRET,
  TUYA_KEY_HOST,
  TUYA_KEY_UID,
  TuyaPaths,
  TuyaTuning,
} from './config.ts';
import { mapCapabilities, mapDevice, mapHistory, mapStates } from './mapper.ts';

/**
 * تكامل Tuya / Smart Life عبر Cloud OpenAPI ([ADR-0001]).
 *
 * يتصل بسحابة Tuya، ويترجم كل استجابة إلى نماذج العقد عبر `mapper.ts`.
 * لا شيء خاص بـ Tuya يتسرّب فوق هذا الملف.
 */
export function createTuyaIntegration(
  context: IntegrationContext,
  client?: TuyaClient,
): Integration {
  const credentials = context.credentials;
  const dataCenter = dataCenterFromHost(credentials[TUYA_KEY_HOST]);
  const uid = credentials[TUYA_KEY_UID] ?? '';

  const http =
    client ??
    createTuyaClient({
      accessId: credentials[TUYA_KEY_ACCESS_ID] ?? '',
      accessSecret: credentials[TUYA_KEY_ACCESS_SECRET] ?? '',
      dataCenter,
    });

  return {
    info: TUYA_INFO,

    /**
     * جلب قائمة الأجهزة يتحقّق من ثلاثة أشياء دفعة واحدة: صحة التوقيع،
     * وصحة مركز البيانات، وصحة الـ UID.
     */
    async verify(): Promise<void> {
      await http.get(TuyaPaths.userDevices(uid));
    },

    async fetchDevices(): Promise<Device[]> {
      const result = await http.get(TuyaPaths.userDevices(uid));
      if (!Array.isArray(result)) return [];

      const devices: Device[] = [];
      for (const item of result) {
        if (typeof item !== 'object' || item === null) continue;
        const device = mapDevice(item as Record<string, unknown>, {
          accountId: context.accountId,
          dataCenter,
        });
        if (device.nativeId) devices.push(device);
      }
      return devices;
    },

    async fetchCapabilities(nativeId: string): Promise<Capability[]> {
      const result = await http.get(TuyaPaths.specifications(nativeId));
      if (typeof result !== 'object' || result === null) return [];
      return mapCapabilities(result as Record<string, unknown>);
    },

    async fetchState(nativeId: string): Promise<StateValue[]> {
      return mapStates(await http.get(TuyaPaths.status(nativeId)));
    },

    async execute(nativeId: string, commands: readonly Command[]): Promise<void> {
      if (commands.length === 0) return;
      await http.post(TuyaPaths.commands(nativeId), {
        commands: commands.map((command) => ({ code: command.key, value: command.value })),
      });
    },

    async fetchHistory(nativeId: string, query: HistoryQuery): Promise<HistoryPoint[]> {
      const params: Record<string, string> = {
        type: TuyaTuning.reportLogType,
        start_time: `${query.start.getTime()}`,
        end_time: `${query.end.getTime()}`,
        size: `${query.limit}`,
      };
      if (query.keys.length > 0) params['codes'] = query.keys.join(',');

      const result = await http.get(TuyaPaths.logs(nativeId), params);
      if (typeof result !== 'object' || result === null) return [];
      return mapHistory((result as Record<string, unknown>)['logs']);
    },

    dispose(): void {
      http.dispose();
    },
  };
}
