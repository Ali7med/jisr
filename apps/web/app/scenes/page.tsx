'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Scene, SceneRunResult } from '@jisr/shared';
import { ApiFailure } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useCatalog } from '../../lib/catalog';
import { formatDateTime, formatValue } from '../../lib/automation-text';
import { Chrome } from '../../components/chrome';
import { SceneForm } from '../../components/scene-form';

export default function ScenesPage() {
  const { api } = useSession();
  const catalog = useCatalog();

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<Record<string, SceneRunResult>>({});

  const load = useCallback(async () => {
    try {
      setScenes((await api.scenes()).scenes);
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

  async function run(scene: Scene) {
    setBusy(scene.id);
    try {
      const result = await api.runScene(scene.id);
      setResults({ ...results, [scene.id]: result });
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(scene: Scene) {
    if (!window.confirm(`سيُحذف مشهد «${scene.name}». متابعة؟`)) return;
    setBusy(scene.id);
    try {
      await api.deleteScene(scene.id);
      await Promise.all([load(), catalog.reload()]);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Chrome>
      <h1>المشاهد</h1>
      <p className="muted">مجموعة أوامر تُنفَّذ بنقرة واحدة، ولو كانت أجهزتها من شركات مختلفة.</p>

      {error && <p className="notice">{error}</p>}
      {catalog.error && <p className="notice">{catalog.error}</p>}

      {!creating && (
        <p>
          <button className="primary" onClick={() => setCreating(true)}>
            مشهد جديد
          </button>
        </p>
      )}

      {loading && <p className="muted">جارٍ التحميل…</p>}

      {!loading && scenes.length === 0 && !error && !creating && (
        <div className="card">
          <p>لا مشاهد بعد.</p>
          <p className="muted">
            أنشئ مشهداً مثل «خروج من البيت» يُطفئ الإنارة والمقابس دفعة واحدة.
          </p>
        </div>
      )}

      <div className="stack">
        {scenes.map((scene) => (
          <article key={scene.id} className="card">
            <div className="row-card-head">
              <strong>
                {scene.icon ? `${scene.icon} ` : ''}
                {scene.name}
              </strong>
              <span className="pill">{scene.steps.length.toLocaleString('ar')} خطوة</span>
            </div>

            <ul className="steps">
              {scene.steps.map((step, index) => (
                <li key={`${step.deviceId}-${step.key}-${index}`}>
                  اجعل «{step.key}» في «{catalog.labels.device(step.deviceId)}»{' '}
                  {formatValue(catalog.capability(step.deviceId, step.key), step.value)}
                </li>
              ))}
            </ul>

            <p className="row">
              <button
                className="primary"
                disabled={busy === scene.id}
                onClick={() => void run(scene)}
              >
                {busy === scene.id ? 'جارٍ التشغيل…' : 'تشغيل'}
              </button>
              <button disabled={busy === scene.id} onClick={() => void remove(scene)}>
                حذف
              </button>
            </p>

            <RunOutcome result={results[scene.id]} catalog={catalog.labels.device} />
          </article>
        ))}
      </div>

      {creating && (
        <SceneForm
          catalog={catalog}
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void load();
            void catalog.reload();
          }}
        />
      )}
    </Chrome>
  );
}

/**
 * نتيجة التشغيل.
 *
 * **النجاح الجزئي حقيقة لا استثناء**: جهاز واحد غير متصل لا يُلغي المشهد،
 * فنقول أي خطوة سقطت ولماذا بدل «فشل التشغيل» التي لا يُبنى عليها فعل.
 */
function RunOutcome({
  result,
  catalog,
}: {
  result: SceneRunResult | undefined;
  catalog: (deviceId: string) => string;
}) {
  if (!result) return null;

  const total = result.succeeded + result.failed;

  return (
    <div className={result.failed === 0 ? 'outcome ok' : 'outcome partial'}>
      <p>
        {result.failed === 0
          ? `نُفِّذت كل الخطوات (${result.succeeded.toLocaleString('ar')} من ${total.toLocaleString('ar')})`
          : `نُفِّذت ${result.succeeded.toLocaleString('ar')} خطوة من ${total.toLocaleString('ar')} — الباقي لم ينجح`}
        <span className="hint"> · {formatDateTime(result.at)}</span>
      </p>

      {result.failures.length > 0 && (
        <ul>
          {result.failures.map((failure, index) => (
            <li key={`${failure.deviceId}-${index}`}>
              «{catalog(failure.deviceId)}»: {failure.message}
            </li>
          ))}
        </ul>
      )}

      {result.failed > 0 && (
        <p className="hint">
          تحقّق من اتصال الأجهزة المذكورة ثم أعد التشغيل — الخطوات الناجحة تبقى كما هي.
        </p>
      )}
    </div>
  );
}
