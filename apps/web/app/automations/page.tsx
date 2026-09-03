'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Automation, AutomationRun } from '@jisr/shared';
import { ApiFailure } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useCatalog } from '../../lib/catalog';
import { describeAutomation, formatDateTime } from '../../lib/automation-text';
import { Chrome } from '../../components/chrome';

export default function AutomationsPage() {
  const { api } = useSession();
  const catalog = useCatalog();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAutomations((await api.automations()).automations);
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

  async function toggle(automation: Automation) {
    setBusy(automation.id);
    try {
      // التبديل يُرسل الأتمتة كاملة: العقد يستقبل `AutomationInput` لا رقعة
      // جزئية، وإرسال الحقل وحده يمحو بقيّتها.
      await api.updateAutomation(automation.id, {
        name: automation.name,
        enabled: !automation.enabled,
        trigger: automation.trigger,
        conditions: automation.conditions,
        actions: automation.actions,
      });
      await load();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(automation: Automation) {
    if (!window.confirm(`سيُحذف «${automation.name}» وسجلّ تشغيله. متابعة؟`)) return;
    setBusy(automation.id);
    try {
      await api.deleteAutomation(automation.id);
      await load();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Chrome>
      <h1>الأتمتة</h1>
      <p className="muted">
        الأتمتة تعيش على الخادم لا على هاتفك — تعمل والهاتف مغلق (ADR-0015).
      </p>

      {error && <p className="notice">{error}</p>}
      {catalog.error && <p className="notice">{catalog.error}</p>}

      <p>
        <Link className="btn primary" href="/automations/new">
          أتمتة جديدة
        </Link>
      </p>

      {loading && <p className="muted">جارٍ التحميل…</p>}

      {!loading && automations.length === 0 && !error && (
        <div className="card">
          <p>لا أتمتة بعد.</p>
          <p className="muted">
            ابدأ بواحدة بسيطة: «حين يفتح باب الحديقة · نفّذ إشعاراً». تبنيها من قوائم
            بلا كتابة سطر واحد.
          </p>
        </div>
      )}

      <div className="stack">
        {automations.map((automation) => (
          <article key={automation.id} className="card">
            <div className="row-card-head">
              <strong>{automation.name}</strong>
              <span className={`pill ${automation.enabled ? 'on' : 'off'}`}>
                {automation.enabled ? 'مفعّلة' : 'موقوفة'}
              </span>
            </div>

            <p className="sentence">{describeAutomation(automation, catalog.labels)}</p>

            <p className="hint">
              آخر تشغيل: {automation.lastRunAt ? formatDateTime(automation.lastRunAt) : 'لم تعمل بعد'}
              {' · '}
              أُنشئت: {formatDateTime(automation.createdAt)}
            </p>

            <p className="row">
              <Link className="btn" href={`/automations/${automation.id}`}>
                تعديل
              </Link>
              <button disabled={busy === automation.id} onClick={() => void toggle(automation)}>
                {automation.enabled ? 'إيقاف' : 'تفعيل'}
              </button>
              <button
                onClick={() => setOpenLog(openLog === automation.id ? null : automation.id)}
              >
                {openLog === automation.id ? 'إخفاء سجلّ التشغيل' : 'سجلّ التشغيل'}
              </button>
              <button disabled={busy === automation.id} onClick={() => void remove(automation)}>
                حذف
              </button>
            </p>

            {openLog === automation.id && <RunLog automationId={automation.id} />}
          </article>
        ))}
      </div>
    </Chrome>
  );
}

/**
 * سجلّ التشغيل — جواب «لماذا لم تعمل أتمتتي؟».
 *
 * محرّك داخل العملية لا يعيد المحاولة عند الفشل (ADR-0015)، فالسجلّ هو
 * الطريق الوحيد ليعرف المستخدم أن الإجراء نُفِّذ وفشل بدل أن يظنّ أنه لم
 * يُستدعَ أصلاً.
 */
function RunLog({ automationId }: { automationId: string }) {
  const { api } = useSession();
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .automationRuns(automationId)
      .then((list) => {
        if (!cancelled) setRuns(list.runs);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, automationId]);

  if (error) return <p className="notice">{error}</p>;
  if (runs === null) return <p className="muted">جارٍ جلب السجلّ…</p>;

  if (runs.length === 0) {
    return (
      <p className="muted">
        لا تنفيذ مسجَّل بعد. إن كنت تنتظر عملها: تأكّد أنها مفعّلة، وأن جهاز
        المُشغِّل متصل ويبلّغ القراءة المختارة.
      </p>
    );
  }

  return (
    <table>
      <tbody>
        {runs.map((run) => (
          <tr key={`${run.ranAt}-${run.detail}`}>
            <td style={{ width: 1, whiteSpace: 'nowrap' }}>
              <span className={`pill ${run.succeeded ? 'on' : 'off'}`}>
                {run.succeeded ? 'نجح' : 'فشل'}
              </span>
            </td>
            <td style={{ width: 1, whiteSpace: 'nowrap' }} className="hint">
              {formatDateTime(run.ranAt)}
            </td>
            <td>{run.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
