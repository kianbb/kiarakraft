'use client';

import { SessionProvider } from 'next-auth/react';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from './ToastProvider';
import { DirectionProvider } from './DirectionProvider';

interface ProvidersProps {
  children: React.ReactNode;
  messages: any;
  locale: string;
  session?: any;
}

export function Providers({ children, messages, locale, session }: ProvidersProps) {
  return (
    <SessionProvider session={session}>
      <NextIntlClientProvider messages={messages} locale={locale}>
        <DirectionProvider />
        {children}
        <ToastProvider />
      </NextIntlClientProvider>
    </SessionProvider>
  );
}