'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  Automation,
  AutomationAction,
  AutomationCondition,
  AutomationInput,
  AutomationTrigger,
  NotifySeverity,
  StateTrigger,
} from '@jisr/shared';
import { ApiFailure } from '../lib/api';
import { useSession } from '../lib/session';
import { useCatalog, type Catalog } from '../lib/catalog';
import {
  DEFAULT_TIMEZONE,
  SEVERITY_LABELS,
  WEEKDAY_LABELS,
  describeAutomation,
  formatValue,
} from '../lib/automation-text';
import {
  CapabilityPicker,
  DevicePicker,
  OperatorPicker,
  TimezonePicker,
  ValueEditor,
  defaultValueFor,
} from './pickers';

/**
 * بانِي الأتمتة البصري.
 *
 * **لا YAML ولا لغة تعبيرات ولا حقل JSON** — كل ما يخرج من هنا هو
 * `AutomationInput` مركّب من قوائم، والمستخدم يقرأ ما بناه جملةً عربية
 * قبل الحفظ. هذا هو معنى P5.2: من لا يبرمج يبني أتمتته بنفسه.
 */

const NEW_STATE_TRIGGER: StateTrigger = {
  kind: 'state',
  deviceId: '',
  key: '',
  op: 'eq',
  value: true,
};

function newCommandAction(): AutomationAction {
  return { kind: 'command', deviceId: '', key: '', value: true };
}

export function AutomationBuilder({
  automation,
  onSaved,
  onCancel,
}: {
  /** `null` يعني أتمتة جديدة؛ غير ذلك تحرير أتمتة قائمة. */
  automation: Automation | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { api } = useSession();
  const catalog = useCatalog();

  const [name, setName] = useState(automation?.name ?? '');
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    automation?.trigger ?? NEW_STATE_TRIGGER,
  );
  const [conditions, setConditions] = useState<AutomationCondition[]>(
    automation?.conditions ?? [],
  );
  const [actions, setActions] = useState<AutomationAction[]>(
    automation?.actions ?? [newCommandAction()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = useMemo(
    () => validate({ name, trigger, conditions, actions }, catalog),
    [name, trigger, conditions, actions, catalog],
  );

  const sentence = describeAutomation({ trigger, conditions, actions }, catalog.labels);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problems.length > 0) return;

    const input: AutomationInput = { name: name.trim(), enabled, trigger, conditions, actions };

    setBusy(true);
    setError(null);
    try {
      if (automation) {
        await api.updateAutomation(automation.id, input);
      } else {
        await api.createAutomation(input);
      }
      onSaved();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {catalog.error && <p className="notice">{catalog.error}</p>}

      <section className="card">
        <label htmlFor="automation-name">اسم الأتمتة</label>
        <input
          id="automation-name"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="hint">اسم تعرفها به لاحقاً، مثل «إطفاء الإنارة عند الفجر».</p>

        <label htmlFor="automation-enabled">حالة الأتمتة</label>
        <select
          id="automation-enabled"
          value={enabled ? 'on' : 'off'}
          onChange={(event) => setEnabled(event.target.value === 'on')}
        >
          <option value="on">مفعّلة — تعمل فور الحفظ</option>
          <option value="off">موقوفة — تُحفظ ولا تعمل</option>
        </select>
      </section>

      <section className="card step">
        <h2 className="step-title">حين…</h2>
        <TriggerEditor catalog={catalog} trigger={trigger} onChange={setTrigger} />
      </section>

      <section className="card step">
        <h2 className="step-title">بشرط…</h2>
        {conditions.length === 0 && (
          <p className="muted">بلا شروط: تعمل الأتمتة كلما وقع المُشغِّل أعلاه.</p>
        )}

        {conditions.map((condition, index) => (
          <ConditionEditor
            key={index}
            catalog={catalog}
            condition={condition}
            onChange={(next) =>
              setConditions(conditions.map((item, at) => (at === index ? next : item)))
            }
            onRemove={() => setConditions(conditions.filter((_, at) => at !== index))}
          />
        ))}

        <p className="row">
          <button
            type="button"
            onClick={() =>
              setConditions([
                ...conditions,
                { kind: 'time_between', from: '18:00', to: '23:00', timezone: DEFAULT_TIMEZONE },
              ])
            }
          >
            + شرط وقت
          </button>
          <button
            type="button"
            onClick={() =>
              setConditions([
                ...conditions,
                { kind: 'device_state', deviceId: '', key: '', op: 'eq', value: true },
              ])
            }
          >
            + شرط حالة جهاز
          </button>
        </p>
      </section>

      <section className="card step">
        <h2 className="step-title">نفّذ…</h2>
        {actions.length === 0 && (
          <p className="muted">لا إجراء بعد — أضف واحداً على الأقل من الأسفل.</p>
        )}

        {actions.map((action, index) => (
          <ActionEditor
            key={index}
            catalog={catalog}
            action={action}
            onChange={(next) =>
              setActions(actions.map((item, at) => (at === index ? next : item)))
            }
            onRemove={() => setActions(actions.filter((_, at) => at !== index))}
          />
        ))}

        <p className="row">
          <button type="button" onClick={() => setActions([...actions, newCommandAction()])}>
            + أمر لجهاز
          </button>
          <button
            type="button"
            onClick={() => setActions([...actions, { kind: 'scene', sceneId: '' }])}
          >
            + تشغيل مشهد
          </button>
          <button
            type="button"
            onClick={() =>
              setActions([...actions, { kind: 'notify', title: '', body: '', severity: 'info' }])
            }
          >
            + إرسال إشعار
          </button>
        </p>
      </section>

      <section className="card">
        <h2 className="step-title">المعاينة</h2>
        {/* المستخدم يقرأ ما بناه جملةً قبل الحفظ — لا يخمّن ما فهمه النظام */}
        <p className="sentence">{sentence}</p>

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
            {busy ? 'جارٍ الحفظ…' : automation ? 'حفظ التعديلات' : 'حفظ الأتمتة'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            إلغاء
          </button>
        </p>
      </section>
    </form>
  );
}

/** ما تشترك فيه مُشغِّلات الحالة وشروط الحالة: جهاز · قراءة · موازنة · قيمة. */
interface Comparison {
  deviceId: string;
  key: string;
  op: StateTrigger['op'];
  value?: unknown;
}

function ComparisonFields({
  catalog,
  id,
  comparison,
  onChange,
}: {
  catalog: Catalog;
  id: string;
  comparison: Comparison;
  onChange: (next: Comparison) => void;
}) {
  const capability = catalog.capability(comparison.deviceId, comparison.key);

  return (
    <div className="fields">
      <div>
        <label htmlFor={`${id}-device`}>الجهاز</label>
        <DevicePicker
          id={`${id}-device`}
          devices={catalog.devices}
          value={comparison.deviceId}
          // تبديل الجهاز يُسقط القراءة والقيمة: مفتاح جهاز سابق على جهاز
          // جديد يمرّ في التحقّق ولا يتحقّق أبداً في التشغيل.
          onChange={(deviceId) => onChange({ deviceId, key: '', op: 'eq', value: '' })}
        />
      </div>

      <div>
        <label htmlFor={`${id}-key`}>القراءة</label>
        <CapabilityPicker
          id={`${id}-key`}
          capabilities={catalog.capabilities(comparison.deviceId)}
          value={comparison.key}
          onChange={(key) => {
            const next = catalog.capability(comparison.deviceId, key);
            onChange({ ...comparison, key, op: 'eq', value: defaultValueFor(next) });
          }}
        />
        <DeviceReading catalog={catalog} deviceId={comparison.deviceId} capabilityKey={comparison.key} />
      </div>

      <div>
        <label htmlFor={`${id}-op`}>الموازنة</label>
        <OperatorPicker
          id={`${id}-op`}
          capability={capability}
          value={comparison.op}
          onChange={(op) =>
            onChange({ ...comparison, op, value: op === 'changed' ? undefined : comparison.value })
          }
        />
      </div>

      {comparison.op !== 'changed' && (
        <div>
          <label htmlFor={`${id}-value`}>القيمة</label>
          <ValueEditor
            id={`${id}-value`}
            capability={capability}
            value={comparison.value}
            onChange={(value) => onChange({ ...comparison, value })}
          />
        </div>
      )}
    </div>
  );
}

/** القراءة الحالية بجانب المُنتقي: المستخدم يقارن بقيمة يراها لا يتخيّلها. */
function DeviceReading({
  catalog,
  deviceId,
  capabilityKey,
}: {
  catalog: Catalog;
  deviceId: string;
  capabilityKey: string;
}) {
  const { loadSnapshot } = catalog;

  useEffect(() => {
    if (deviceId) loadSnapshot(deviceId);
  }, [deviceId, loadSnapshot]);

  if (!deviceId || !capabilityKey) return null;
  const reading = catalog.reading(deviceId, capabilityKey);

  return (
    <p className="hint">
      القراءة الآن:{' '}
      {reading.known
        ? formatValue(catalog.capability(deviceId, capabilityKey), reading.value)
        : 'لم تصل بعد'}
    </p>
  );
}

function TriggerEditor({
  catalog,
  trigger,
  onChange,
}: {
  catalog: Catalog;
  trigger: AutomationTrigger;
  onChange: (trigger: AutomationTrigger) => void;
}) {
  return (
    <>
      <label htmlFor="trigger-kind">ما الذي يُشغّلها؟</label>
      <select
        id="trigger-kind"
        value={trigger.kind}
        onChange={(event) =>
          onChange(
            event.target.value === 'state'
              ? NEW_STATE_TRIGGER
              : { kind: 'schedule', at: '07:00', days: [], timezone: DEFAULT_TIMEZONE },
          )
        }
      >
        <option value="state">تصير قراءة جهاز كذا</option>
        <option value="schedule">يحين وقت كذا</option>
      </select>

      {trigger.kind === 'state' ? (
        <ComparisonFields
          catalog={catalog}
          id="trigger"
          comparison={trigger}
          onChange={(next) => onChange({ kind: 'state', ...next })}
        />
      ) : (
        <div className="fields">
          <div>
            <label htmlFor="trigger-at">الساعة</label>
            <input
              id="trigger-at"
              type="time"
              className="ltr"
              value={trigger.at}
              onChange={(event) => onChange({ ...trigger, at: event.target.value })}
            />
          </div>

          <div>
            <label htmlFor="trigger-timezone">المنطقة الزمنية</label>
            <TimezonePicker
              id="trigger-timezone"
              value={trigger.timezone}
              onChange={(timezone) => onChange({ ...trigger, timezone })}
            />
            {/* العقد يترك المنطقة بلا افتراضي عمداً؛ نعرضها كي لا تعمل
                الأتمتة بتوقيت لا يقصده المستخدم وهو لا يدري */}
            <p className="hint">الساعة أعلاه تُحسب بهذه المنطقة.</p>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label>الأيام</label>
            <DayToggles
              days={trigger.days}
              onChange={(days) => onChange({ ...trigger, days })}
            />
            <p className="hint">
              {trigger.days.length === 0 ? 'بلا اختيار تعمل كل يوم.' : 'تعمل في الأيام المحدّدة فقط.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function DayToggles({
  days,
  onChange,
}: {
  days: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="days">
      {WEEKDAY_LABELS.map((label, day) => {
        const on = days.includes(day);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            className={on ? 'primary' : ''}
            onClick={() =>
              onChange(on ? days.filter((item) => item !== day) : [...days, day].sort((a, b) => a - b))
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ConditionEditor({
  catalog,
  condition,
  onChange,
  onRemove,
}: {
  catalog: Catalog;
  condition: AutomationCondition;
  onChange: (condition: AutomationCondition) => void;
  onRemove: () => void;
}) {
  const id = `condition-${condition.kind}-${
    condition.kind === 'device_state' ? condition.deviceId : condition.from
  }`;

  return (
    <div className="row-card">
      <div className="row-card-head">
        <strong>{condition.kind === 'time_between' ? 'شرط وقت' : 'شرط حالة جهاز'}</strong>
        <button type="button" onClick={onRemove}>
          إزالة الشرط
        </button>
      </div>

      {condition.kind === 'time_between' ? (
        <div className="fields">
          <div>
            <label htmlFor={`${id}-from`}>من الساعة</label>
            <input
              id={`${id}-from`}
              type="time"
              className="ltr"
              value={condition.from}
              onChange={(event) => onChange({ ...condition, from: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-to`}>إلى الساعة</label>
            <input
              id={`${id}-to`}
              type="time"
              className="ltr"
              value={condition.to}
              onChange={(event) => onChange({ ...condition, to: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-timezone`}>المنطقة الزمنية</label>
            <TimezonePicker
              id={`${id}-timezone`}
              value={condition.timezone}
              onChange={(timezone) => onChange({ ...condition, timezone })}
            />
          </div>
          {condition.from > condition.to && (
            <p className="hint" style={{ gridColumn: '1 / -1' }}>
              المدى يمتدّ بعد منتصف الليل — مسموح ومقصود.
            </p>
          )}
        </div>
      ) : (
        <ComparisonFields
          catalog={catalog}
          id={id}
          comparison={condition}
          onChange={(next) => onChange({ kind: 'device_state', ...next })}
        />
      )}
    </div>
  );
}

const ACTION_LABELS = { command: 'أمر لجهاز', scene: 'تشغيل مشهد', notify: 'إرسال إشعار' };

function ActionEditor({
  catalog,
  action,
  onChange,
  onRemove,
}: {
  catalog: Catalog;
  action: AutomationAction;
  onChange: (action: AutomationAction) => void;
  onRemove: () => void;
}) {
  const id = `action-${action.kind}-${action.kind === 'command' ? action.deviceId : ''}`;

  return (
    <div className="row-card">
      <div className="row-card-head">
        <strong>{ACTION_LABELS[action.kind]}</strong>
        <button type="button" onClick={onRemove}>
          إزالة الإجراء
        </button>
      </div>

      {action.kind === 'command' && (
        <div className="fields">
          <div>
            <label htmlFor={`${id}-device`}>الجهاز</label>
            {/* أجهزة بلا قدرة قابلة للإرسال لا تُعرض هنا: اختيارها يبني
                إجراءً يفشل في كل تشغيل */}
            <DevicePicker
              id={`${id}-device`}
              devices={catalog.devices}
              writableOnly
              value={action.deviceId}
              onChange={(deviceId) => onChange({ ...action, deviceId, key: '', value: true })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-key`}>ما الذي تغيّره</label>
            <CapabilityPicker
              id={`${id}-key`}
              capabilities={catalog.capabilities(action.deviceId)}
              writableOnly
              value={action.key}
              onChange={(key) =>
                onChange({
                  ...action,
                  key,
                  value: defaultValueFor(catalog.capability(action.deviceId, key)),
                })
              }
            />
            <DeviceReading catalog={catalog} deviceId={action.deviceId} capabilityKey={action.key} />
          </div>
          <div>
            <label htmlFor={`${id}-value`}>القيمة الجديدة</label>
            <ValueEditor
              id={`${id}-value`}
              capability={catalog.capability(action.deviceId, action.key)}
              value={action.value}
              onChange={(value) => onChange({ ...action, value })}
            />
          </div>
        </div>
      )}

      {action.kind === 'scene' && (
        <>
          <label htmlFor={`${id}-scene`}>المشهد</label>
          <select
            id={`${id}-scene`}
            value={action.sceneId}
            disabled={catalog.scenes.length === 0}
            onChange={(event) => onChange({ ...action, sceneId: event.target.value })}
          >
            <option value="" disabled>
              {catalog.scenes.length === 0 ? 'لا مشاهد بعد…' : 'اختر مشهداً…'}
            </option>
            {catalog.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.icon ? `${scene.icon} ${scene.name}` : scene.name}
              </option>
            ))}
          </select>
          {catalog.scenes.length === 0 && (
            <p className="hint">أنشئ مشهداً من صفحة «المشاهد» ثم عد إلى هنا.</p>
          )}
        </>
      )}

      {action.kind === 'notify' && (
        <div className="fields">
          <div>
            <label htmlFor={`${id}-title`}>عنوان الإشعار</label>
            <input
              id={`${id}-title`}
              value={action.title}
              maxLength={80}
              onChange={(event) => onChange({ ...action, title: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-severity`}>الدرجة</label>
            <select
              id={`${id}-severity`}
              value={action.severity}
              onChange={(event) =>
                onChange({ ...action, severity: event.target.value as NotifySeverity })
              }
            >
              {(Object.keys(SEVERITY_LABELS) as NotifySeverity[]).map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABELS[severity]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${id}-body`}>النص</label>
            <input
              id={`${id}-body`}
              value={action.body}
              maxLength={300}
              onChange={(event) => onChange({ ...action, body: event.target.value })}
            />
            <p className="hint">قل ما ينبغي فعله، لا ما وقع فقط.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * التحقّق قبل الإرسال. كل رسالة تقول **ما يفعله المستخدم** لا ما نقصه
 * النموذج، والمكرّر يُطوى كي لا تتحوّل القائمة إلى جدار.
 */
function validate(
  draft: {
    name: string;
    trigger: AutomationTrigger;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
  },
  catalog: Catalog,
): string[] {
  const problems: string[] = [];

  if (draft.name.trim().length === 0) problems.push('اكتب اسماً للأتمتة كي تميّزها في القائمة.');

  if (draft.trigger.kind === 'state') {
    if (!draft.trigger.deviceId) problems.push('اختر الجهاز الذي يُشغّل الأتمتة.');
    else if (!draft.trigger.key) problems.push('اختر القراءة التي تُراقَب على جهاز المُشغِّل.');
  } else {
    if (!draft.trigger.at) problems.push('حدّد ساعة تشغيل الأتمتة.');
    if (!draft.trigger.timezone) problems.push('اختر المنطقة الزمنية لساعة التشغيل.');
  }

  for (const condition of draft.conditions) {
    if (condition.kind === 'device_state') {
      if (!condition.deviceId) problems.push('اختر الجهاز في شرط حالة الجهاز، أو أزل الشرط.');
      else if (!condition.key) problems.push('اختر القراءة في شرط حالة الجهاز، أو أزل الشرط.');
    } else if (!condition.from || !condition.to) {
      problems.push('حدّد بداية شرط الوقت ونهايته.');
    }
  }

  if (draft.actions.length === 0) problems.push('أضف إجراءً واحداً على الأقل تحت «نفّذ».');

  for (const action of draft.actions) {
    if (action.kind === 'command') {
      if (!action.deviceId) problems.push('اختر الجهاز في إجراء «أمر لجهاز».');
      else if (!action.key) problems.push('اختر ما يتغيّر في إجراء «أمر لجهاز».');
    } else if (action.kind === 'scene') {
      if (!action.sceneId) {
        problems.push(
          catalog.scenes.length === 0
            ? 'لا مشاهد بعد — أنشئ مشهداً من صفحة «المشاهد» أو أزل إجراء المشهد.'
            : 'اختر المشهد في إجراء «تشغيل مشهد».',
        );
      }
    } else if (action.title.trim().length === 0) {
      problems.push('اكتب عنوان الإشعار في إجراء «إرسال إشعار».');
    }
  }

  return [...new Set(problems)];
}
