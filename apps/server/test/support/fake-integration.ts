import type { Capability, Device, HistoryPoint, IntegrationInfo, StateValue } from '@jisr/shared';
import { makeDeviceId } from '@jisr/shared';
import { IntegrationError } from '../../src/integrations/errors.ts';
import type { Command } from '@jisr/shared';
import type { IntegrationEntry } from '../../src/integrations/types.ts';

export const FAKE_ID = 'fake';

export const FAKE_INFO: IntegrationInfo = {
  id: FAKE_ID,
  nameAr: 'شركة تجريبية',
  nameEn: 'Fake Co.',
  description: 'تكامل وهمي للاختبارات — بلا شبكة.',
  supportsHistory: true,
  supportsPairing: false,
  fields: [
    { key: 'token', label: 'الرمز', type: 'secret', options: [], required: true },
    { key: 'note', label: 'ملاحظة', type: 'text', options: [], required: false },
  ],
};

/** ما يتحكّم به الاختبار: ما تُرجعه الاستدعاءات وما تُسجّله. */
export interface FakeState {
  devices: { nativeId: string; name: string; category: string; online: boolean }[];
  capabilities: Capability[];
  values: StateValue[];
  historyPoints: HistoryPoint[];
  executed: { nativeId: string; commands: readonly Command[] }[];
  capabilityCalls: number;
  stateCalls: number;
  historyCalls: number;
  disposed: number;
  /** يُرمى من كل استدعاء — لاختبار ترجمة الأخطاء. */
  failWith: IntegrationError | null;
  /** يُرمى من `verify` وحده — لاختبار رفض حفظ حساب لا يعمل. */
  verifyFailsWith: IntegrationError | null;
}

export function createFakeIntegration(): { entry: IntegrationEntry; state: FakeState } {
  const state: FakeState = {
    devices: [{ nativeId: 'd1', name: 'مصباح', category: 'light', online: true }],
    capabilities: [
      { key: 'switch_1', kind: 'toggle', writable: true, readable: true, step: 1, scale: 0, options: [] },
    ],
    values: [{ key: 'switch_1', value: true }],
    historyPoints: [],
    executed: [],
    capabilityCalls: 0,
    stateCalls: 0,
    historyCalls: 0,
    disposed: 0,
    failWith: null,
    verifyFailsWith: null,
  };

  function guard(): void {
    if (state.failWith) throw state.failWith;
  }

  const entry: IntegrationEntry = {
    info: FAKE_INFO,
    create: (context) => ({
      info: FAKE_INFO,
      async verify() {
        if (state.verifyFailsWith) throw state.verifyFailsWith;
        guard();
      },
      async fetchDevices(): Promise<Device[]> {
        guard();
        return state.devices.map((device) => ({
          id: makeDeviceId(FAKE_ID, device.nativeId),
          integrationId: FAKE_ID,
          accountId: context.accountId,
          nativeId: device.nativeId,
          name: device.name,
          category: device.category as Device['category'],
          online: device.online,
          model: '',
          productName: '',
          isSubDevice: false,
          capabilities: [],
        }));
      },
      async fetchCapabilities() {
        guard();
        state.capabilityCalls += 1;
        return state.capabilities;
      },
      async fetchState() {
        guard();
        state.stateCalls += 1;
        return state.values;
      },
      async execute(nativeId, commands) {
        guard();
        state.executed.push({ nativeId, commands });
      },
      async fetchHistory() {
        guard();
        state.historyCalls += 1;
        return state.historyPoints;
      },
      dispose() {
        state.disposed += 1;
      },
    }),
  };

  return { entry, state };
}
