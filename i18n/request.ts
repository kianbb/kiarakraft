import { getRequestConfig } from 'next-intl/server';
import en from '../locales/en.json';
import fa from '../locales/fa.json';

const locales = ['fa', 'en'] as const;
type Locale = (typeof locales)[number];

const messagesMap: Record<Locale, typeof fa> = {
  en,
  fa,
};

// Normalize an incoming locale (region variants such as `en-US` or `fa-IR`);
// anything unsupported falls back to Persian, the default locale.
export function chooseLocale(locale?: string): Locale {
  const baseLocale = locale ? locale.split('-')[0] : undefined;
  return baseLocale && locales.includes(baseLocale as Locale)
    ? (baseLocale as Locale)
    : 'fa';
}

function getTimeZoneForLocale(locale: Locale): string {
  return locale === 'en' ? 'UTC' : 'Asia/Tehran';
}

// next-intl 4: the locale arrives through `requestLocale`, which reflects the
// `[locale]` segment registered with `setRequestLocale`, or an explicit
// override such as `getTranslations({ locale })`.
export default getRequestConfig(async ({ requestLocale }) => {
  const chosen = chooseLocale(await requestLocale);

  return {
    locale: chosen,
    messages: messagesMap[chosen],
    timeZone: getTimeZoneForLocale(chosen),
    onError: error => {
      console.error('[i18n] Translation error for locale', chosen, error);
    },
    getMessageFallback: ({ namespace, key }) => {
      console.warn('[i18n] Missing translation key:', `${namespace}.${key}`);
      // Show the key rather than silently falling back to the other locale.
      return `[Missing: ${namespace}.${key}]`;
    },
  };
});
