import { Inter, Vazirmatn } from 'next/font/google';

// English font
export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  fallback: ['system-ui', 'arial'],
  weight: ['400', '500', '600', '700'],
});

// Persian font
export const vazirmatn = Vazirmatn({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-vazirmatn',
  preload: true,
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
  weight: ['400', '500', '600', '700'],
});