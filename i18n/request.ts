import { getRequestConfig } from 'next-intl/server';

const locales = ['fa', 'en'];

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locale || !locales.includes(locale)) {
    // Default to 'fa' if locale is undefined or invalid
    locale = 'fa';
  }

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default,
    timeZone: 'Asia/Tehran'
  };
});