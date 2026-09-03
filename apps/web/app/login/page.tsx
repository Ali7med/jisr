'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiFailure } from '../../lib/api';
import { useSession } from '../../lib/session';

export default function LoginPage() {
  const { user, ready, signIn, signUp } = useSession();
  const router = useRouter();

  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace('/devices');
  }, [ready, user, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (registering) {
        await signUp(email.trim(), password, displayName.trim());
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/devices');
    } catch (failure) {
      // الرسالة عربية وكتبها السيرفر — نعرضها كما هي (القاعدة الحاكمة 4).
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 420 }}>
      <h1>جسر</h1>
      <p className="muted">
        حسابك على جسر يحفظ ربط شركاتك ويشغّل أتمتتك على مدار الساعة.
      </p>

      <form className="card" onSubmit={submit}>
        {registering && (
          <>
            <label htmlFor="name">الاسم</label>
            <input
              id="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </>
        )}

        <label htmlFor="email">البريد الإلكتروني</label>
        <input
          id="email"
          className="ltr"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">كلمة المرور</label>
        <input
          id="password"
          className="ltr"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          // نفس حدّ السيرفر: نمنع رحلة ذهاب وإياب بلا فائدة
          minLength={registering ? 10 : undefined}
          required
        />
        {registering && <p className="hint">عشرة محارف على الأقل.</p>}

        {error && <p className="notice">{error}</p>}

        <p style={{ marginTop: 20 }}>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'لحظة…' : registering ? 'إنشاء حساب' : 'تسجيل الدخول'}
          </button>
        </p>
        <button
          type="button"
          onClick={() => {
            setRegistering(!registering);
            setError(null);
          }}
        >
          {registering ? 'لديك حساب؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ واحداً'}
        </button>
      </form>
    </main>
  );
}
