'use client';

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

export function Price({
  amount,
  className = '',
  showConversions = false,
  fxRates = {},
}: PriceProps) {
  const locale = useLocale();
  const t = useTranslations('common');
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
