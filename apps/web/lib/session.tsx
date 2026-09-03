'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserProfile } from '@jisr/shared';
import { createApi, type Api, type Tokens } from './api';

/**
 * جلسة المستخدم في المتصفّح.
 *
 * **حدّ معروف وموثّق:** الرموز في `localStorage`، فثغرة XSS في اللوحة
 * تعني سرقة جلسة. البديل (كعكة `httpOnly` + CSRF) يقتضي أن يُصدر السيرفر
 * كعكات لا رموز حاملة، وهو تغيير في عقد المصادقة يستحق قراراً مستقلاً
 * قبل خدمة مستخدمين حقيقيين — لا تفصيلاً يُقرَّر في ملف واجهة.
 */
const STORAGE_KEY = 'jisr.session.v1';

interface StoredSession {
  tokens: Tokens;
  user: UserProfile;
}

interface SessionValue {
  api: Api;
  user: UserProfile | null;
  /** تحتاجه القناة اللحظية لإطار المصادقة الأول. */
  accessToken: string | null;
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function read(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.tokens?.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  // القراءة بعد التركيب لا أثناءه: الخادم لا يملك `localStorage`.
  useEffect(() => {
    setSession(read());
    setReady(true);
  }, []);

  const persist = useCallback((next: StoredSession | null) => {
    setSession(next);
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const api = useMemo(
    () =>
      createApi({
        tokens: session?.tokens ?? null,
        onTokens: (tokens) => {
          if (!tokens) return persist(null);
          setSession((current) => {
            if (!current) return current;
            const next = { ...current, tokens };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        },
      }),
    [session, persist],
  );

  const value: SessionValue = {
    api,
    user: session?.user ?? null,
    accessToken: session?.tokens.accessToken ?? null,
    ready,

    async signIn(email, password) {
      const result = await api.login(email, password);
      persist({ tokens: result.tokens, user: result.user });
    },

    async signUp(email, password, displayName) {
      const result = await api.register(email, password, displayName);
      persist({ tokens: result.tokens, user: result.user });
    },

    async signOut() {
      const refreshToken = session?.tokens.refreshToken;
      // نخرج محلياً دائماً: مستخدم ضغط «خروج» يجب أن يخرج، لا أن يعلق
      // بسبب انقطاع شبكة.
      persist(null);
      if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession خارج SessionProvider');
  return value;
}
