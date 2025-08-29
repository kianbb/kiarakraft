/**
 * Format price in Toman with proper locale formatting
 */
export function formatPrice(price: number, locale: string = 'fa'): string {
  if (locale === 'fa') {
    // Persian formatting with Persian numerals
    const formatted = new Intl.NumberFormat('fa-IR').format(price);
    return `${formatted} تومان`;
  } else {
    // English formatting
    const formatted = new Intl.NumberFormat('en-US').format(price);
    return `${formatted} Toman`;
  }
}

/**
 * Format price with optional converted currencies (async version for server components)
 */
export async function formatPriceWithConversions(
  price: number,
  locale: string = 'fa',
  showConversions: boolean = true
): Promise<string> {
  const primaryPrice = formatPrice(price, locale);

  if (!showConversions) {
    return primaryPrice;
  }

  try {
    // Import dynamically to avoid circular dependencies
    const { convertPrice, formatConvertedPrice } = await import('./fx');

    const [usdAmount, eurAmount] = await Promise.all([
      convertPrice(price, 'USD'),
      convertPrice(price, 'EUR'),
    ]);

    const conversions: string[] = [];

    if (usdAmount !== null && usdAmount > 0) {
      conversions.push(formatConvertedPrice(usdAmount, 'USD', locale));
    }

    if (eurAmount !== null && eurAmount > 0) {
      conversions.push(formatConvertedPrice(eurAmount, 'EUR', locale));
    }

    if (conversions.length > 0) {
      const conversionText = conversions.join(' • ');
      return `${primaryPrice} (${conversionText})`;
    }
  } catch (error) {
    console.warn('Failed to get currency conversions:', error);
  }

  return primaryPrice;
}

/**
 * Client-side price formatter with pre-fetched rates
 */
export function formatPriceWithRates(
  price: number,
  locale: string = 'fa',
  rates: { USD?: number; EUR?: number } = {},
  showConversions: boolean = true
): string {
  const primaryPrice = formatPrice(price, locale);

  if (!showConversions || Object.keys(rates).length === 0) {
    return primaryPrice;
  }

  const conversions: string[] = [];

  if (rates.USD) {
    const usdAmount = price * 10 * rates.USD; // Convert Toman to IRR, then to USD
    if (usdAmount > 0) {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      conversions.push(formatter.format(usdAmount));
    }
  }

  if (rates.EUR) {
    const eurAmount = price * 10 * rates.EUR; // Convert Toman to IRR, then to EUR
    if (eurAmount > 0) {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      conversions.push(formatter.format(eurAmount));
    }
  }

  if (conversions.length > 0) {
    const conversionText = conversions.join(' • ');
    return `${primaryPrice} (${conversionText})`;
  }

  return primaryPrice;
}

/**
 * Convert Persian numerals to English numerals
 */
export function persianToEnglishDigits(str: string): string {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';

  return str.replace(/[۰-۹]/g, char => {
    return englishDigits[persianDigits.indexOf(char)];
  });
}

/**
 * Convert English numerals to Persian numerals
 */
export function englishToPersianDigits(str: string): string {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';

  return str.replace(/[0-9]/g, char => {
    return persianDigits[englishDigits.indexOf(char)];
  });
}
