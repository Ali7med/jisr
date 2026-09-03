'use client';

import { useState, type FormEvent } from 'react';
import type { SceneInput, SceneStep } from '@jisr/shared';
import { ApiFailure } from '../lib/api';
import { useSession } from '../lib/session';
import type { Catalog } from '../lib/catalog';
import { CapabilityPicker, DevicePicker, ValueEditor, defaultValueFor } from './pickers';

/**
 * محرّر مشهد: خطوات تُختار من قوائم الأجهزة نفسها.
 *
 * المشهد عابر للشركات بطبيعته — الخطوة تُوجَّه بمعرّف الجهاز المركّب، فلا
 * سطر هنا يخصّ شركة بعينها ولا اسم شركة يظهر للمستخدم.
 */
export function SceneForm({
  catalog,
  onCancel,
  onDone,
}: {
  catalog: Catalog;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { api } = useSession();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [steps, setSteps] = useState<SceneStep[]>([{ deviceId: '', key: '', value: true }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = validate(name, steps);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problems.length > 0) return;

    const input: SceneInput = { name: name.trim(), icon: icon.trim(), steps };
    setBusy(true);
    setError(null);
    try {
      await api.createScene(input);
      onDone();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: 16 }} onSubmit={submit}>
      <h2 className="step-title">مشهد جديد</h2>

      <div className="fields">
        <div>
          <label htmlFor="scene-name">اسم المشهد</label>
          <input
            id="scene-name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="hint">مثل «سهرة» أو «خروج من البيت».</p>
        </div>
        <div>
          <label htmlFor="scene-icon">رمز (اختياري)</label>
          <input
            id="scene-icon"
            value={icon}
            maxLength={4}
            onChange={(event) => setIcon(event.target.value)}
          />
          <p className="hint">رمز تعبيري واحد يميّزه في القائمة.</p>
        </div>
      </div>

      <h3 className="step-title">الخطوات</h3>
      {steps.map((step, index) => (
        <div key={index} className="row-card">
          <div className="row-card-head">
            <strong>الخطوة {(index + 1).toLocaleString('ar')}</strong>
            <button
              type="button"
              disabled={steps.length === 1}
              title={steps.length === 1 ? 'المشهد يحتاج خطوة واحدة على الأقل' : undefined}
              onClick={() => setSteps(steps.filter((_, at) => at !== index))}
            >
              إزالة
            </button>
          </div>

          <div className="fields">
            <div>
              <label htmlFor={`step-${index}-device`}>الجهاز</label>
              <DevicePicker
                id={`step-${index}-device`}
                devices={catalog.devices}
                writableOnly
                value={step.deviceId}
                onChange={(deviceId) =>
                  setSteps(
                    steps.map((item, at) =>
                      at === index ? { deviceId, key: '', value: true } : item,
                    ),
                  )
                }
              />
            </div>
            <div>
              <label htmlFor={`step-${index}-key`}>ما الذي يتغيّر</label>
              <CapabilityPicker
                id={`step-${index}-key`}
                capabilities={catalog.capabilities(step.deviceId)}
                writableOnly
                value={step.key}
                onChange={(key) =>
                  setSteps(
                    steps.map((item, at) =>
                      at === index
                        ? {
                            ...item,
                            key,
                            value: defaultValueFor(catalog.capability(step.deviceId, key)),
                          }
                        : item,
                    ),
                  )
                }
              />
            </div>
            <div>
              <label htmlFor={`step-${index}-value`}>القيمة</label>
              <ValueEditor
                id={`step-${index}-value`}
                capability={catalog.capability(step.deviceId, step.key)}
                value={step.value}
                onChange={(value) =>
                  setSteps(steps.map((item, at) => (at === index ? { ...item, value } : item)))
                }
              />
            </div>
          </div>
        </div>
      ))}

      <p className="row">
        <button
          type="button"
          onClick={() => setSteps([...steps, { deviceId: '', key: '', value: true }])}
        >
          + خطوة
        </button>
      </p>

      {problems.length > 0 && (
        <ul className="notice">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {error && <p className="notice">{error}</p>}

      <p className="row" style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={busy || problems.length > 0}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ المشهد'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
      </p>
    </form>
  );
}

function validate(name: string, steps: SceneStep[]): string[] {
  const problems: string[] = [];
  if (name.trim().length === 0) problems.push('اكتب اسماً للمشهد كي تميّزه في القائمة.');
  if (steps.length === 0) problems.push('أضف خطوة واحدة على الأقل.');
  for (const step of steps) {
    if (!step.deviceId) problems.push('اختر الجهاز في كل خطوة، أو أزل الخطوة الفارغة.');
    else if (!step.key) problems.push('اختر ما يتغيّر في كل خطوة.');
  }
  return [...new Set(problems)];
}
