import { getRequestConfig } from 'next-intl/server';
import en from '../locales/en.json';
import fa from '../locales/fa.json';

const locales = ['fa', 'en'];

const messagesMap: Record<string, any> = {
  en,
  fa,
};

export default getRequestConfig(({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  const chosen = locale && locales.includes(locale) ? locale : 'fa';

  return {
    locale: chosen,
    messages: messagesMap[chosen],
    timeZone: 'Asia/Tehran'
  };
});