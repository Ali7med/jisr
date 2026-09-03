'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '../lib/session';

/** بوّابة: إلى الأجهزة إن كانت هناك جلسة، وإلى الدخول إن لم تكن. */
export default function Home() {
  const { user, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready) router.replace(user ? '/devices' : '/login');
  }, [ready, user, router]);

  return <main className="shell">جارٍ التحميل…</main>;
}
