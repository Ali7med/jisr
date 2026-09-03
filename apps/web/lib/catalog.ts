'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Capability, Device, Scene } from '@jisr/shared';
import { ApiFailure } from './api';
import { useSession } from './session';
import type { Labels } from './automation-text';

/**
 * فهرس ما يستطيع البانِي أن يشير إليه: الأجهزة وقدراتها والمشاهد.
 *
 * **لا يُكتب مفتاح قدرة بيد المستخدم أبداً** — يُختار من قائمة مصدرها
 * `/devices`، وقراءته الحالية تأتي من `/devices/{id}` كي يرى المستخدم
 * القيمة التي يقارن بها قبل أن يحفظ.
 */
export interface Catalog {
  devices: Device[];
  scenes: Scene[];
  loading: boolean;
  error: string | null;
  labels: Labels;
  device(deviceId: string): Device | undefined;
  capabilities(deviceId: string): Capability[];
  capability(deviceId: string, key: string): Capability | undefined;
  /** القراءة الآن — `known` كاذبة ما لم تصل اللقطة بعد. */
  reading(deviceId: string, key: string): { known: boolean; value: unknown };
  /** يجلب لقطة جهاز مرة واحدة؛ يُستدعى من مؤثّر عقب اختيار الجهاز. */
  loadSnapshot(deviceId: string): void;
  reload(): Promise<void>;
}

export function useCatalog(): Catalog {
  const { api } = useSession();
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, ReadonlyMap<string, unknown>>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // طلبات جارية أو منتهية: بلا هذا يعيد كل رسم جلب اللقطة نفسها.
  const requested = useRef(new Set<string>());

  const reload = useCallback(async () => {
    try {
      const [deviceList, sceneList] = await Promise.all([api.devices(), api.scenes()]);
      setDevices(deviceList.devices);
      setScenes(sceneList.scenes);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadSnapshot = useCallback(
    (deviceId: string) => {
      if (!deviceId || requested.current.has(deviceId)) return;
      requested.current.add(deviceId);
      void api
        .device(deviceId)
        .then((snapshot) => {
          const values = new Map(snapshot.values.map((value) => [value.key, value.value]));
          setSnapshots((current) => new Map(current).set(deviceId, values));
        })
        // تعذّر جلب اللقطة لا يمنع البناء: القدرات موجودة في قائمة الأجهزة،
        // وما يضيع هو عرض «القراءة الآن» وحده.
        .catch(() => undefined);
    },
    [api],
  );

  return useMemo(() => {
    const byId = new Map(devices.map((device) => [device.id, device]));
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

    const device = (deviceId: string) => byId.get(deviceId);
    const capabilities = (deviceId: string) => byId.get(deviceId)?.capabilities ?? [];
    const capability = (deviceId: string, key: string) =>
      capabilities(deviceId).find((item) => item.key === key);

    const labels: Labels = {
      // جهاز حُذف بعد بناء الأتمتة يجب أن يظهر بمعرّفه لا أن يختفي بصمت.
      device: (deviceId) => byId.get(deviceId)?.name ?? deviceId,
      scene: (sceneId) => sceneById.get(sceneId)?.name ?? 'مشهد محذوف',
      capability,
    };

    return {
      devices,
      scenes,
      loading,
      error,
      labels,
      device,
      capabilities,
      capability,
      reading: (deviceId, key) => {
        const values = snapshots.get(deviceId);
        if (!values || !values.has(key)) return { known: false, value: undefined };
        return { known: true, value: values.get(key) };
      },
      loadSnapshot,
      reload,
    };
  }, [devices, scenes, snapshots, loading, error, loadSnapshot, reload]);
}
