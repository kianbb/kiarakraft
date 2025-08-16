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

function getTimeZoneForLocale(locale: string): string {
  // Return appropriate timezone based on locale
  switch (locale) {
    case 'fa':
      return 'Asia/Tehran';
    case 'en':
      return 'UTC'; // Or 'America/New_York' depending on target audience
    default:
      return 'Asia/Tehran'; // Default to Tehran time
  }
}

export function Providers({ children, messages, locale, session }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <SessionProvider session={session}>
        <NextIntlClientProvider 
          messages={messages} 
          locale={locale} 
          timeZone={getTimeZoneForLocale(locale)}
          onError={(error) => {
            console.error('[Providers] Translation error for locale', locale, ':', error);
          }}
          getMessageFallback={({ namespace, key }) => {
            console.warn('[Providers] Missing translation key:', `${namespace}.${key}`, 'for locale:', locale);
            // Return key name instead of falling back to other locale
            return `[Missing: ${namespace}.${key}]`;
          }}
        >
          <DirectionProvider />
          {children}
          <ToastProvider />
        </NextIntlClientProvider>
      </SessionProvider>
    </ErrorBoundary>
  );
}