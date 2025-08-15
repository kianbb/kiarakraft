import { getRequestConfig } from 'next-intl/server';
import en from '../locales/en.json';
import fa from '../locales/fa.json';

const locales = ['fa', 'en'];

const messagesMap: Record<string, any> = {
  en,
  fa,
};
// Export a small helper so we can unit-test the locale normalization logic.
export function chooseLocale(locale?: string) {
  // Normalize incoming locale (handle region variants like `en-US` or `fa-IR`)
  const baseLocale = locale ? locale.split('-')[0] : undefined;
  return baseLocale && locales.includes(baseLocale) ? baseLocale : 'fa';
}

export default getRequestConfig(({ locale }) => {
  const chosen = chooseLocale(locale);

  return {
    locale: chosen,
    messages: messagesMap[chosen],
    timeZone: 'Asia/Tehran'
  };
});