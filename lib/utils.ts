import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number, locale: string = 'fa'): string {
  const isRTL = locale === 'fa';
  const formatted = new Intl.NumberFormat(isRTL ? 'fa-IR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
  
  if (isRTL) {
    return `${formatted} تومان`;
  } else {
    return `${formatted} TMN`;
  }
}

export function formatDate(date: string | Date, locale: string = 'fa'): string {
  const isRTL = locale === 'fa';
  return new Intl.DateTimeFormat(isRTL ? 'fa-IR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}