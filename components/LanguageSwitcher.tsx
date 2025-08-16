'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const switchLanguage = (newLocale: string) => {
    // Extract the path without the current locale prefix
    const pathSegments = pathname.split('/').filter(Boolean);
    
    // Remove the first segment if it's a locale
    if (pathSegments.length > 0 && ['fa', 'en'].includes(pathSegments[0])) {
      pathSegments.shift();
    }
    
    // Reconstruct the path with the new locale
    const newPath = `/${newLocale}${pathSegments.length > 0 ? '/' + pathSegments.join('/') : ''}`;
    
    // Preserve query parameters
    const queryString = searchParams.toString();
    const fullPath = queryString ? `${newPath}?${queryString}` : newPath;
    
    router.push(fullPath);
  };

  return (
    <div className="flex items-center gap-2">
      <Languages className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      <select
        value={locale}
        onChange={(e) => switchLanguage(e.target.value)}
        className="bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
        aria-label={t('language')}
        title={t('language')}
      >
        <option value="fa">فارسی</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}