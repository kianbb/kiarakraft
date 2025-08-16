'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';

export default function NotFound() {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  
  const _t = useTranslations('product');
  const _locale = useLocale();
  
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
  const locale = isHydrated ? _locale : 'en';
  
  if (!isHydrated) {
    return (
      <main className="container py-10">
        <h1 className="text-xl font-semibold">Product not found</h1>
  <p className="mt-2">The product you&apos;re looking for doesn&apos;t exist.</p>
        <a href="/en/explore" className="underline mt-4 inline-block">
          Back to Explore
        </a>
      </main>
    );
  }
  
  return (
    <main className="container py-10">
      <h1 className="text-xl font-semibold">{t('notFound')}</h1>
      <p className="mt-2">{t('notFoundDescription')}</p>
      <a href={`/${locale}/explore`} className="underline mt-4 inline-block">
        {t('backToExplore')}
      </a>
    </main>
  );
}