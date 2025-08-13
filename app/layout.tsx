import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kiara Kraft - کیارا کرفت | Iranian Handmade Marketplace",
    template: "%s | Kiara Kraft - کیارا کرفت"
  },
  description: "Discover unique Iranian handcrafted products. From traditional pottery and textiles to modern jewelry and woodwork. Support local artisans. - محصولات منحصر به فرد دست‌ساز ایرانی را کشف کنید.",
  keywords: ["Iranian handicrafts", "handmade", "pottery", "textiles", "jewelry", "woodwork", "صنایع دستی ایرانی", "دستساز", "سفالگری", "منسوجات"],
  authors: [{ name: "Kiara Kraft" }],
  creator: "Kiara Kraft",
  publisher: "Kiara Kraft",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    alternateLocale: ['en_US'],
    url: 'https://kiarakraft.com',
    siteName: 'Kiara Kraft - کیارا کرفت',
    title: 'Kiara Kraft - Iranian Handmade Marketplace',
    description: 'Discover unique Iranian handcrafted products. Support local artisans.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Kiara Kraft - Iranian Handmade Marketplace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kiara Kraft - Iranian Handmade Marketplace',
    description: 'Discover unique Iranian handcrafted products. Support local artisans.',
    images: ['/og-image.jpg'],
  },
  verification: {
    google: 'google-site-verification-code',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
