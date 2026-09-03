'use client';

import { useState, type FormEvent } from 'react';
import type { CredentialField, IntegrationInfo } from '@jisr/shared';
import { ApiFailure } from '../lib/api';
import { useSession } from '../lib/session';

/**
 * نموذج ربط حساب — **مبني بالكامل من `IntegrationInfo.fields`**.
 *
 * لا حقل مكتوب يدوياً لأي شركة: هذه هي القاعدة الحاكمة 7 عملياً، وهي ما
 * يجعل شركة جديدة تظهر في اللوحة بلا نشر نسخة جديدة منها.
 */
export function AccountForm({
  info,
  onCancel,
  onDone,
}: {
  info: IntegrationInfo;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { api } = useSession();
  const [label, setLabel] = useState(info.nameAr);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(info.fields.map((field) => [field.key, field.defaultValue ?? ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // السيرفر يتحقّق من الاعتمادات لدى الشركة **قبل** الحفظ، فنجاح
      // الطلب يعني أن الحساب يعمل فعلاً لا أنه حُفظ فقط.
      await api.createAccount({
        integrationId: info.id,
        label: label.trim() || info.nameAr,
        credentials: values,
      });
      onDone();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: 16 }} onSubmit={submit}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>ربط {info.nameAr}</h2>

      <label htmlFor="account-label">اسم الحساب</label>
      <input
        id="account-label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <p className="hint">اسم تميّزه به، مثل «البيت» أو «المكتب».</p>

      {info.fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          disabled={busy}
          onChange={(value) => setValues({ ...values, [field.key]: value })}
        />
      ))}

      {error && <p className="notice">{error}</p>}

      <p style={{ marginTop: 20 }}>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'جارٍ الاختبار…' : 'اختبار الاتصال والحفظ'}
        </button>{' '}
        <button type="button" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
      </p>
    </form>
  );
}

function Field({
  field,
  value,
  disabled,
  onChange,
}: {
  field: CredentialField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.key}`;

  return (
    <>
      <label htmlFor={id}>{field.label}</label>

      {field.type === 'choice' ? (
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" disabled>
            اختر…
          </option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.hint ? `${option.label} — ${option.hint}` : option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          // بيانات الاعتماد لاتينية دائماً؛ الاتجاه العربي يجعلها غير مقروءة
          className="ltr"
          type={field.type === 'secret' ? 'password' : 'text'}
          value={value}
          disabled={disabled}
          required={field.required}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.hint && <p className="hint">{field.hint}</p>}
    </>
  );
}
