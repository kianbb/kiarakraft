'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

export function DirectionProvider() {
  const locale = useLocale();
  
  useEffect(() => {
    const html = document.documentElement;
    const isRTL = locale === 'fa';
    
    html.setAttribute('lang', locale);
    html.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  }, [locale]);

  return null;
}