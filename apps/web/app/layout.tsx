import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SessionProvider } from '../lib/session';

export const metadata: Metadata = {
  title: 'جسر — لوحة التحكّم',
  description: 'منصة تحكّم موحّدة لأجهزة المنزل الذكي عبر شركات متعدّدة',
};

/** التطبيق عربي بالكامل: `dir=rtl` على الجذر لا على كل عنصر. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
