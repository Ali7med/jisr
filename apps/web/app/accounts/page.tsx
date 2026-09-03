'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Account, IntegrationInfo } from '@jisr/shared';
import { ApiFailure } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Chrome } from '../../components/chrome';
import { AccountForm } from '../../components/account-form';

const STATUS_LABELS: Record<Account['status'], string> = {
  active: 'يعمل',
  invalid_credentials: 'رفضت الشركة البيانات — أعد إدخالها',
  expired: 'انتهى اشتراك مشروعك لدى الشركة — جدّده',
  disabled: 'موقوف',
};

export default function AccountsPage() {
  const { api } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [chosen, setChosen] = useState<IntegrationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [accountList, integrationList] = await Promise.all([
        api.accounts(),
        api.integrations(),
      ]);
      setAccounts(accountList.accounts);
      setIntegrations(integrationList.integrations);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'sync' | 'delete') {
    setBusy(id);
    try {
      if (action === 'sync') {
        await api.syncAccount(id);
      } else {
        await api.deleteAccount(id);
      }
      await load();
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Chrome>
      <h1>الحسابات المرتبطة</h1>
      {error && <p className="notice">{error}</p>}

      {accounts.length === 0 && (
        <p className="muted">لم تربط أي حساب بعد. اختر شركتك من الأسفل.</p>
      )}

      <div className="grid">
        {accounts.map((account) => (
          <article key={account.id} className="card">
            <strong>{account.label}</strong>
            <p className="hint">
              {account.integrationId} · {account.deviceCount} جهاز
            </p>
            <p>
              <span className={`pill ${account.status === 'active' ? 'on' : 'off'}`}>
                {STATUS_LABELS[account.status]}
              </span>
            </p>
            <p>
              <button disabled={busy === account.id} onClick={() => void act(account.id, 'sync')}>
                مزامنة الأجهزة
              </button>{' '}
              <button
                disabled={busy === account.id}
                onClick={() => {
                  if (window.confirm('سيُحذف الحساب وأجهزته وسجلّها. متابعة؟')) {
                    void act(account.id, 'delete');
                  }
                }}
              >
                إزالة
              </button>
            </p>
          </article>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>ربط حساب جديد</h2>
      {/* الشركات ونماذجها تأتي من السيرفر — لا صفحة جديدة لشركة جديدة
          (القاعدة الحاكمة 7) */}
      <div className="grid">
        {integrations.map((info) => (
          <article key={info.id} className="card">
            <strong>{info.nameAr}</strong>
            <p className="hint" dir="ltr">
              {info.nameEn}
            </p>
            <p className="muted">{info.description}</p>
            {info.setupUrl && (
              <p>
                <a href={info.setupUrl} target="_blank" rel="noreferrer">
                  دليل الحصول على البيانات
                </a>
              </p>
            )}
            <button className="primary" onClick={() => setChosen(info)}>
              ربط
            </button>
          </article>
        ))}
      </div>

      {chosen && (
        <AccountForm
          info={chosen}
          onCancel={() => setChosen(null)}
          onDone={() => {
            setChosen(null);
            void load();
          }}
        />
      )}
    </Chrome>
  );
}
