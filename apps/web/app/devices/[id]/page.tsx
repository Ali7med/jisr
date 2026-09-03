'use client';

import { use, useCallback, useEffect, useState } from 'react';
import {
  fromDisplay,
  toDisplay,
  type Capability,
  type DeviceSnapshot,
  type HistoryPoint,
} from '@jisr/shared';
import { ApiFailure } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useRealtime, type StateEventPayload } from '../../../lib/realtime';
import { Chrome } from '../../../components/chrome';
import { Sparkline } from '../../../components/sparkline';

export default function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const deviceId = decodeURIComponent(use(params).id);
  const { api, accessToken } = useSession();

  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [chartKey, setChartKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);

  const load = useCallback(async () => {
    try {
      setSnapshot(await api.device(deviceId));
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    }
  }, [api, deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime(
    accessToken,
    useCallback(
      (event: StateEventPayload) => {
        if (event.deviceId !== deviceId) return;
        setSnapshot((current) =>
          current
            ? { ...current, values: mergeValues(current.values, event.values) }
            : current,
        );
      },
      [deviceId],
    ),
  );

  async function send(capability: Capability, value: unknown) {
    if (!snapshot) return;
    const previous = snapshot.values;

    // تحديث تفاؤلي: الواجهة تستجيب فوراً وتتراجع إن فشل الأمر.
    setSnapshot({
      ...snapshot,
      values: mergeValues(previous, [{ key: capability.key, value }]),
    });
    setPending(capability.key);

    try {
      await api.command(deviceId, capability.key, value);
      await load();
    } catch (failure) {
      setSnapshot((current) => (current ? { ...current, values: previous } : current));
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setPending(null);
    }
  }

  async function openChart(capability: Capability) {
    setChartKey(capability.key);
    setHistory(null);
    try {
      setHistory((await api.history(deviceId, capability.key, 24)).points);
    } catch {
      setHistory([]);
    }
  }

  const device = snapshot?.device;
  const values = new Map(snapshot?.values.map((value) => [value.key, value.value]) ?? []);
  const controls = device?.capabilities.filter((c) => c.writable) ?? [];
  const readings = device?.capabilities.filter((c) => c.readable && !c.writable) ?? [];
  const charted = device?.capabilities.find((c) => c.key === chartKey);

  return (
    <Chrome>
      <h1>{device?.name ?? 'جارٍ التحميل…'}</h1>
      {device && (
        <p>
          <span className={`pill ${device.online ? 'on' : 'off'}`}>
            {device.online ? 'متصل' : 'غير متصل'}
          </span>{' '}
          <span className="pill">{device.integrationId}</span>
        </p>
      )}

      {error && <p className="notice">{error}</p>}
      {device && !device.online && (
        <p className="notice">الجهاز غير متصل بالإنترنت — الأوامر لن تصله حتى يعود.</p>
      )}

      <h2 style={{ fontSize: 16 }}>التحكّم</h2>
      {controls.length === 0 && <p className="muted">لا توجد عناصر تحكّم لهذا الجهاز.</p>}
      <div className="grid">
        {controls.map((capability) => (
          <Control
            key={capability.key}
            capability={capability}
            value={values.get(capability.key)}
            disabled={!device?.online || pending === capability.key}
            onChange={(value) => void send(capability, value)}
          />
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>القراءات</h2>
      {readings.length === 0 && <p className="muted">لا قراءات يبلّغ بها هذا الجهاز.</p>}
      <table>
        <tbody>
          {readings.map((capability) => (
            <tr key={capability.key}>
              <td>{capability.key}</td>
              <td>{format(capability, values.get(capability.key))}</td>
              <td style={{ width: 1 }}>
                <button onClick={() => void openChart(capability)}>السجلّ</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {charted && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>
            سجلّ {charted.key} — آخر ٢٤ ساعة
          </h2>
          {history === null ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : (
            <Sparkline points={history} capability={charted} />
          )}
        </section>
      )}
    </Chrome>
  );
}

function mergeValues(
  current: DeviceSnapshot['values'],
  incoming: DeviceSnapshot['values'],
): DeviceSnapshot['values'] {
  const merged = new Map(current.map((value) => [value.key, value]));
  for (const value of incoming) merged.set(value.key, value);
  return [...merged.values()];
}

function format(capability: Capability, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? 'يعمل' : 'متوقّف';
  if (typeof value === 'number') {
    const shown = toDisplay(capability, value);
    return `${shown.toLocaleString('ar')}${capability.unit ? ` ${capability.unit}` : ''}`;
  }
  return String(value);
}

function Control({
  capability,
  value,
  disabled,
  onChange,
}: {
  capability: Capability;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="card">
      <strong>{capability.key}</strong>

      {capability.kind === 'toggle' && (
        <p>
          <button
            className="primary"
            disabled={disabled}
            onClick={() => onChange(value !== true)}
          >
            {value === true ? 'إطفاء' : 'تشغيل'}
          </button>
        </p>
      )}

      {capability.kind === 'range' && (
        <RangeControl
          capability={capability}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      )}

      {capability.kind === 'mode' && (
        <select
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" disabled>
            اختر…
          </option>
          {capability.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {/* قدرة لا نعرف نوعها تُعرض خامّاً ولا تُخفى (القاعدة الحاكمة 3) */}
      {(capability.kind === 'text' || capability.kind === 'unknown') && (
        <p className="muted">{format(capability, value)}</p>
      )}
    </div>
  );
}

function RangeControl({
  capability,
  value,
  disabled,
  onChange,
}: {
  capability: Capability;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const shown = typeof value === 'number' ? toDisplay(capability, value) : 0;

  return (
    <>
      <input
        type="range"
        disabled={disabled}
        min={toDisplay(capability, capability.min ?? 0)}
        max={toDisplay(capability, capability.max ?? 100)}
        step={toDisplay(capability, capability.step) || 1}
        value={shown}
        onChange={(event) => onChange(fromDisplay(capability, Number(event.target.value)))}
      />
      <span className="muted">
        {shown.toLocaleString('ar')}
        {capability.unit ? ` ${capability.unit}` : ''}
      </span>
    </>
  );
}
