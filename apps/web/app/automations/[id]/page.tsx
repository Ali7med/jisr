'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Automation } from '@jisr/shared';
import { ApiFailure } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { Chrome } from '../../../components/chrome';
import { AutomationBuilder } from '../../../components/automation-builder';

export default function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const id = use(params).id;
  const { api } = useSession();
  const router = useRouter();

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // لا مسار «جلب أتمتة واحدة» في العقد، والقائمة صغيرة بطبعها — نأخذها
  // منها بدل إضافة مسار لا يحتاجه أحد غير هذه الصفحة.
  useEffect(() => {
    let cancelled = false;
    api
      .automations()
      .then((list) => {
        if (cancelled) return;
        setAutomation(list.automations.find((item) => item.id === id) ?? null);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  return (
    <Chrome>
      <h1>تعديل الأتمتة</h1>

      {error && <p className="notice">{error}</p>}
      {loading && <p className="muted">جارٍ التحميل…</p>}

      {!loading && !automation && !error && (
        <div className="card">
          <p>لم نعثر على هذه الأتمتة — يبدو أنها حُذفت.</p>
          <Link className="btn" href="/automations">
            العودة إلى قائمة الأتمتة
          </Link>
        </div>
      )}

      {automation && (
        <AutomationBuilder
          automation={automation}
          onSaved={() => router.push('/automations')}
          onCancel={() => router.push('/automations')}
        />
      )}
    </Chrome>
  );
}
