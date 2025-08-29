'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface PriceProps {
  amount: number;
  className?: string;
  showConversions?: boolean;
  fxRates?: {
    USD?: number;
    EUR?: number;
  };
}

// Guarded price component: avoid calling next-intl hooks during SSR
export function Price({
  amount,
  className = '',
  showConversions = false,
  fxRates = {},
}: PriceProps) {
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
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);
  const isRTL = locale === 'fa';

  const formatted = new Intl.NumberFormat(isRTL ? 'fa-IR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  const currency = t('currency');

  // Calculate conversions if enabled and rates available
  const conversions: string[] = [];
  if (showConversions && Object.keys(fxRates).length > 0) {
    if (fxRates.USD) {
      const usdAmount = amount * 10 * fxRates.USD; // Convert Toman to IRR, then to USD
      if (usdAmount > 0) {
        const formatter = new Intl.NumberFormat(isRTL ? 'fa-IR' : 'en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        conversions.push(formatter.format(usdAmount));
      }
    }

    if (fxRates.EUR) {
      const eurAmount = amount * 10 * fxRates.EUR; // Convert Toman to IRR, then to EUR
      if (eurAmount > 0) {
        const formatter = new Intl.NumberFormat(isRTL ? 'fa-IR' : 'en-US', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        conversions.push(formatter.format(eurAmount));
      }
    }
  }

  return (
    <span
      className={`${className} ${isRTL ? 'font-vazir' : ''}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {formatted} {currency}
      {conversions.length > 0 && (
        <span className="text-sm text-muted-foreground ml-1">
          ({conversions.join(' • ')})
        </span>
      )}
    </span>
  );
}
