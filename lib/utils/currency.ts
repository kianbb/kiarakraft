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
 * Convert Persian numerals to English numerals
 */
export function persianToEnglishDigits(str: string): string {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  
  return str.replace(/[۰-۹]/g, (char) => {
    return englishDigits[persianDigits.indexOf(char)];
  });
}

/**
 * Convert English numerals to Persian numerals
 */
export function englishToPersianDigits(str: string): string {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  
  return str.replace(/[0-9]/g, (char) => {
    return persianDigits[englishDigits.indexOf(char)];
  });
}