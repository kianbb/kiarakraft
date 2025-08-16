'use client';

import { useLocale, useTranslations } from 'next-intl';

interface PriceProps {
  amount: number;
  className?: string;
}

export function Price({ amount, className = '' }: PriceProps) {
  const locale = useLocale();
  const t = useTranslations('common');
  const isRTL = locale === 'fa';
  
  const formatted = new Intl.NumberFormat(isRTL ? 'fa-IR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  
  const currency = t('currency');
  
  return (
    <span className={`${className} ${isRTL ? 'font-vazir' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {isRTL ? `${formatted} ${currency}` : `${formatted} ${currency}`}
    </span>
  );
}