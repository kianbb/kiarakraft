'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface PriceProps {
  amount: number;
  className?: string;
}

// Guarded price component: avoid calling next-intl hooks during SSR
export function Price({ amount, className = '' }: PriceProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Render a neutral server-side placeholder to avoid calling i18n hooks
  if (!isHydrated) {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    return (
      <span className={className} dir="ltr" aria-hidden>
        {formatted} TMN
      </span>
    );
  }
  // useLocale/useTranslations should only be called on client after hydration
  const locale = isHydrated ? useLocale() : 'en';
  const t = isHydrated ? useTranslations('common') : ((k: string) => k) as any;
  const isRTL = locale === 'fa';

  const formatted = new Intl.NumberFormat(isRTL ? 'fa-IR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  const currency = t('currency');

  return (
    <span className={`${className} ${isRTL ? 'font-vazir' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {formatted} {currency}
    </span>
  );
}