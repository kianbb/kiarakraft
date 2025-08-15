'use client';

import { Toaster } from 'sonner';
import { useLocale } from 'next-intl';

export function ToastProvider() {
  const locale = useLocale();
  const isRTL = locale === 'fa';

  return (
    <Toaster
      position={isRTL ? "top-left" : "top-right"}
      dir={isRTL ? "rtl" : "ltr"}
      richColors
      closeButton
      theme="light"
      toastOptions={{
        style: {
          fontFamily: 'var(--font-inter)',
        },
      }}
    />
  );
}