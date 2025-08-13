import { useLocale as useNextIntlLocale } from 'next-intl';

export function useLocale() {
  const locale = useNextIntlLocale();
  
  return {
    locale,
    isRTL: locale === 'fa',
    formatPrice: (price: number) => {
      const formatted = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(price);
      
      if (locale === 'fa') {
        return `${formatted} تومان`;
      } else {
        return `${formatted} TMN`;
      }
    },
    formatDate: (date: string | Date) => {
      return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(date));
    }
  };
}