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

  // Call hooks unconditionally (keeps hook order stable); use safe fallbacks until hydrated
  const _locale = useLocale();
  const _t = useTranslations('common');

  // Render a neutral server-side placeholder to avoid calling i18n hooks values before hydration
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
  const locale = isHydrated ? _locale : 'en';
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
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