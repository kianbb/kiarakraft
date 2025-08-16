'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';

export function DirectionProvider() {
  // Keep hook order stable: call hooks and use safe fallback until hydrated
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const _locale = useLocale();
  const locale = isHydrated ? _locale : 'en';

  useEffect(() => {
    if (!isHydrated) return;
    const html = document.documentElement;
    const isRTL = locale === 'fa';

    html.setAttribute('lang', locale);
    html.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  }, [isHydrated, locale]);

  return null;
}