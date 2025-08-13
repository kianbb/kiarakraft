'use client';

import { Toaster } from 'sonner';
import { usePathname } from 'next/navigation';

export function ToastProvider() {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'fa';
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