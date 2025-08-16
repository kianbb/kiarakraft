'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

export function DirectionProvider() {
  // Hydration guard: only use locale after client-side hydration
  const [isHydrated, setIsHydrated] = require('react').useState(false);
  require('react').useEffect(() => setIsHydrated(true), []);

  const locale = isHydrated ? useLocale() : 'en';

  useEffect(() => {
    if (!isHydrated) return;
    const html = document.documentElement;
    const isRTL = locale === 'fa';
    
    html.setAttribute('lang', locale);
    html.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  }, [isHydrated, locale]);

  return null;
}