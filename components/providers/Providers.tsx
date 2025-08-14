'use client';

import { SessionProvider } from 'next-auth/react';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from './ToastProvider';
import { DirectionProvider } from './DirectionProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { Session } from 'next-auth';

interface ProvidersProps {
  children: React.ReactNode;
  messages: Record<string, Record<string, string>>;
  locale: string;
  session?: Session | null;
}

export function Providers({ children, messages, locale, session }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <SessionProvider session={session}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <DirectionProvider />
          {children}
          <ToastProvider />
        </NextIntlClientProvider>
      </SessionProvider>
    </ErrorBoundary>
  );
}