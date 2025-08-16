'use client';

import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { useLocale } from 'next-intl';

export function ToastProvider() {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const _locale = useLocale();
  const locale = isHydrated ? _locale : 'en';
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