'use client';

import {
  fromDisplay,
  toDisplay,
  type Capability,
  type CapabilityKind,
  type CompareOp,
  type Device,
} from '@jisr/shared';
import { COMPARE_LABELS, timezoneOptions } from '../lib/automation-text';

/**
 * عناصر الاختيار المشتركة بين بانِي الأتمتة ومحرّر المشاهد.
 *
 * كلّها قوائم: لا حقل حرّ لمعرّف جهاز ولا لمفتاح قدرة. مفتاح مكتوب بخطأ
 * مطبعي يعني أتمتة صامتة لا تعمل ولا تقول لماذا — وهو ما يُبطل P5 كلّه.
 */

const KIND_LABELS: Readonly<Record<CapabilityKind, string>> = Object.freeze({
  toggle: 'تشغيل/إطفاء',
  range: 'قيمة عددية',
  mode: 'اختيار من قائمة',
  text: 'قراءة نصية',
  unknown: 'نوع غير معروف',
});

/**
 * الموازنات المعروضة تتبع نوع القدرة: «أكبر من» على مفتاح تشغيل/إطفاء
 * شرط لا يتحقّق أبداً، وعرضه يغري المستخدم ببناء أتمتة ميتة.
 */
export function operatorOptions(capability: Capability | undefined): CompareOp[] {
  if (!capability) return ['eq', 'ne', 'changed'];
  if (capability.kind === 'range') return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'changed'];
  return ['eq', 'ne', 'changed'];
}

/** قيمة أولية معقولة عند تبديل القدرة، كي لا يُحفظ شرط بقيمة قدرة سابقة. */
export function defaultValueFor(capability: Capability | undefined): unknown {
  if (!capability) return '';
  if (capability.kind === 'toggle') return true;
  if (capability.kind === 'range') return capability.min ?? 0;
  if (capability.kind === 'mode') return capability.options[0] ?? '';
  return '';
}

export function DevicePicker({
  id,
  devices,
  value,
  writableOnly = false,
  onChange,
}: {
  id: string;
  devices: Device[];
  value: string;
  /** التحكّم يحتاج جهازاً له قدرة قابلة للإرسال؛ الشرط يقرأ أي جهاز. */
  writableOnly?: boolean;
  onChange: (deviceId: string) => void;
}) {
  const visible = writableOnly
    ? devices.filter((device) => device.capabilities.some((capability) => capability.writable))
    : devices;

  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled>
        اختر جهازاً…
      </option>
      {visible.map((device) => (
        <option key={device.id} value={device.id}>
          {device.room ? `${device.name} — ${device.room}` : device.name}
          {device.online ? '' : ' (غير متصل)'}
        </option>
      ))}
    </select>
  );
}

export function CapabilityPicker({
  id,
  capabilities,
  value,
  writableOnly = false,
  onChange,
}: {
  id: string;
  capabilities: Capability[];
  value: string;
  writableOnly?: boolean;
  onChange: (key: string) => void;
}) {
  const visible = writableOnly
    ? capabilities.filter((capability) => capability.writable)
    : capabilities;

  return (
    <select
      id={id}
      value={value}
      disabled={visible.length === 0}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" disabled>
        {visible.length === 0 ? 'اختر الجهاز أولاً…' : 'اختر ما تقيسه…'}
      </option>
      {visible.map((capability) => (
        <option key={capability.key} value={capability.key}>
          {capability.key} — {KIND_LABELS[capability.kind]}
          {capability.unit ? ` (${capability.unit})` : ''}
        </option>
      ))}
    </select>
  );
}

/**
 * محرّر القيمة يتبدّل بنوع القدرة: مفتاح يعطي «يعمل/متوقّف»، ومدى يعطي
 * حقلاً عددياً بحدوده، وقائمة تعطي خياراتها. القيمة المخزَّنة خام كما
 * ينتظرها الجهاز، والمعروضة مقسومة على `scale`.
 */
export function ValueEditor({
  id,
  capability,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  capability: Capability | undefined;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  if (capability?.kind === 'toggle') {
    return (
      <select
        id={id}
        disabled={disabled}
        value={value === true ? 'true' : 'false'}
        onChange={(event) => onChange(event.target.value === 'true')}
      >
        <option value="true">يعمل</option>
        <option value="false">متوقّف</option>
      </select>
    );
  }

  if (capability?.kind === 'mode') {
    return (
      <select
        id={id}
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
    );
  }

  if (capability?.kind === 'range') {
    const shown = typeof value === 'number' ? toDisplay(capability, value) : '';
    return (
      <>
        <input
          id={id}
          type="number"
          className="ltr"
          disabled={disabled}
          min={toDisplay(capability, capability.min ?? 0)}
          max={toDisplay(capability, capability.max ?? 100)}
          step={toDisplay(capability, capability.step) || 1}
          value={shown}
          onChange={(event) => onChange(fromDisplay(capability, Number(event.target.value)))}
        />
        <p className="hint">
          بين {toDisplay(capability, capability.min ?? 0).toLocaleString('ar')} و
          {toDisplay(capability, capability.max ?? 100).toLocaleString('ar')}
          {capability.unit ? ` ${capability.unit}` : ''}
        </p>
      </>
    );
  }

  return (
    <input
      id={id}
      className="ltr"
      disabled={disabled}
      value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function OperatorPicker({
  id,
  capability,
  value,
  onChange,
}: {
  id: string;
  capability: Capability | undefined;
  value: CompareOp;
  onChange: (op: CompareOp) => void;
}) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value as CompareOp)}>
      {operatorOptions(capability).map((op) => (
        <option key={op} value={op}>
          {COMPARE_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

export function TimezonePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (timezone: string) => void;
}) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {timezoneOptions(value).map((zone) => (
        <option key={zone} value={zone} className="ltr">
          {zone}
        </option>
      ))}
    </select>
  );
}
