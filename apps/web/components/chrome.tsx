'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '../lib/session';
import { useRealtime, type RealtimeStatus } from '../lib/realtime';
import { NotificationBell } from './notification-bell';

const TABS = [
  { href: '/devices', label: 'الأجهزة' },
  { href: '/scenes', label: 'المشاهد' },
  { href: '/automations', label: 'الأتمتة' },
  { href: '/accounts', label: 'الحسابات' },
];

/** إطار الصفحات المحمية: يحرس الجلسة ويعرض حالة الاتصال صراحةً. */
export function Chrome({ children }: { children: ReactNode }) {
  const { user, ready, accessToken, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // القناة مشتركة على مستوى التبويب، فاشتراك الإطار هنا لا يفتح وصلة
  // ثانية فوق ما تشترك به الصفحة — ويجعل النقطة صادقة في كل صفحة.
  const status = useRealtime(accessToken);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready) return <main className="shell">جارٍ التحميل…</main>;
  if (!user) return null;

  return (
    <>
      <header className="topbar">
        <span className="brand">جسر</span>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="btn"
            style={
              pathname.startsWith(tab.href)
                ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                : undefined
            }
          >
            {tab.label}
          </Link>
        ))}
        <NotificationBell />
        <LiveDot status={status} />
        <span className="muted">{user.displayName}</span>
        <button
          onClick={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        >
          خروج
        </button>
      </header>
      <main className="shell">{children}</main>
    </>
  );
}

/**
 * حالة القناة معروضة دائماً — لوحة تبدو حيّة وهي مقطوعة تُوهم المستخدم
 * أن العطل في جهازه (ADR-0014).
 */
function LiveDot({ status }: { status: RealtimeStatus }) {
  const label =
    status === 'connected'
      ? 'التحديث اللحظي يعمل'
      : status === 'connecting'
        ? 'جارٍ الاتصال…'
        : 'لا اتصال لحظي — البيانات قد تكون قديمة';

  return (
    <span className={`pill ${status === 'connected' ? 'on' : 'off'}`} title={label}>
      {status === 'connected' ? '● لحظي' : '○ غير متصل'}
    </span>
  );
}
