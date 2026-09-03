'use client';

import { useRouter } from 'next/navigation';
import { Chrome } from '../../../components/chrome';
import { AutomationBuilder } from '../../../components/automation-builder';

export default function NewAutomationPage() {
  const router = useRouter();

  return (
    <Chrome>
      <h1>أتمتة جديدة</h1>
      <p className="muted">اختر من القوائم؛ الجملة في الأسفل تقول ما ستفعله فعلاً.</p>

      <AutomationBuilder
        automation={null}
        onSaved={() => router.push('/automations')}
        onCancel={() => router.push('/automations')}
      />
    </Chrome>
  );
}
