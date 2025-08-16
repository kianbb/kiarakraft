import { getRequestConfig } from 'next-intl/server';
import en from '../locales/en.json';
import fa from '../locales/fa.json';

const locales = ['fa', 'en'] as const;
type Locale = typeof locales[number];

const messagesMap: Record<Locale, any> = {
  en,
  fa,
};

// Export a small helper so we can unit-test the locale normalization logic.
export function chooseLocale(locale?: string): Locale {
  // Normalize incoming locale (handle region variants like `en-US` or `fa-IR`)
  const baseLocale = locale ? locale.split('-')[0] : undefined;
  return baseLocale && locales.includes(baseLocale as Locale) ? (baseLocale as Locale) : 'fa';
}

export default getRequestConfig(({ locale }) => {
  // If no locale provided, this indicates a configuration issue
  if (!locale) {
    console.warn('[i18n/request.ts] No locale provided - this should not happen with proper middleware');
    // For now, fall back to Persian (default) but this should be investigated
    const chosen = 'fa';
    console.log('[i18n/request.ts] Chosen locale (emergency fallback):', chosen);
    return {
      locale: chosen,
      messages: messagesMap[chosen],
      timeZone: 'Asia/Tehran'
    };
  }
  
  console.log('[i18n/request.ts] Incoming locale:', locale);
  
  const chosen = chooseLocale(locale);
  console.log('[i18n/request.ts] Chosen locale:', chosen);

  return {
    locale: chosen,
    messages: messagesMap[chosen],
    timeZone: 'Asia/Tehran'
  };
});