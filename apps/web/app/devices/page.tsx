'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DEVICE_CATEGORY_LABELS_AR, type Device } from '@jisr/shared';
import { ApiFailure } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Chrome } from '../../components/chrome';

export default function DevicesPage() {
  const { api } = useSession();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setDevices((await api.devices()).devices);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? devices.filter(
        (device) =>
          device.name.toLowerCase().includes(needle) ||
          device.productName.toLowerCase().includes(needle),
      )
    : devices;

  const groups = new Map<string, Device[]>();
  for (const device of visible) {
    const label = device.room ?? DEVICE_CATEGORY_LABELS_AR[device.category];
    groups.set(label, [...(groups.get(label) ?? []), device]);
  }

  return (
    <Chrome>
      <h1>الأجهزة</h1>

      {error && <p className="notice">{error}</p>}

      <p>
        <input
          placeholder="ابحث عن جهاز…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </p>

      {loading && <p className="muted">جارٍ التحميل…</p>}

      {!loading && devices.length === 0 && !error && (
        <div className="card">
          <p>لا أجهزة بعد.</p>
          <p className="muted">
            اربط حساب شركتك أولاً، وستظهر أجهزتك هنا تلقائياً.
          </p>
          <Link className="btn" href="/accounts">
            ربط حساب
          </Link>
        </div>
      )}

      {[...groups.entries()].map(([label, list]) => (
        <section key={label}>
          <h2 style={{ fontSize: 16 }}>
            {label} <span className="muted">{list.length}</span>
          </h2>
          <div className="grid">
            {list.map((device) => (
              <Link key={device.id} href={`/devices/${encodeURIComponent(device.id)}`}>
                <article className="card">
                  <strong>{device.name}</strong>
                  <div style={{ marginTop: 6 }}>
                    <span className={`pill ${device.online ? 'on' : 'off'}`}>
                      {device.online ? 'متصل' : 'غير متصل'}
                    </span>{' '}
                    <span className="pill">
                      {DEVICE_CATEGORY_LABELS_AR[device.category]}
                    </span>
                  </div>
                  {device.productName && (
                    <p className="hint">{device.productName}</p>
                  )}
                </article>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </Chrome>
  );
}
