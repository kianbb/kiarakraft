import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Providers } from '@/components/providers/Providers';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { StructuredData } from '@/components/seo/StructuredData';
import { inter, vazirmatn } from '@/lib/fonts';
import { Metadata } from 'next';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

// Ensure both locales are statically generated so SSR uses the right messages
export function generateStaticParams() {
  return [{ locale: 'fa' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });
  
  const canonicalUrl = `https://kiarakraft.com/${locale}`;
  const alternateUrls = {
    'fa-IR': 'https://kiarakraft.com/fa',
    'en-US': 'https://kiarakraft.com/en'
  };

  return {
    metadataBase: new URL('https://kiarakraft.com'),
    title: {
      template: `%s - ${t('hero.title')}`,
      default: `${t('hero.title')} - ${t('hero.subtitle')}`
    },
    description: t('hero.description'),
    keywords: locale === 'fa' 
      ? 'محصولات دستساز ایرانی، صنایع دستی، بازار آنلاین، هنرمندان ایرانی، کیارا کرفت، سرامیک، نساجی، جواهرات، صنایع چوبی'
      : 'Iranian handmade, handcrafted products, online marketplace, Iranian artisans, Kiara Kraft, ceramics, textiles, jewelry, woodwork',
    authors: [{ name: 'Kiara Kraft' }],
    creator: 'Kiara Kraft',
    publisher: 'Kiara Kraft',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    alternates: {
      canonical: canonicalUrl,
      languages: alternateUrls
    },
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
    verification: {
      // Add these when ready for production
      // google: 'your-google-site-verification-code',
      // yandex: 'your-yandex-verification-code',
    },
    openGraph: {
      title: `${t('hero.title')} - ${t('hero.subtitle')}`,
      description: t('hero.description'),
      url: canonicalUrl,
      siteName: t('hero.title'),
      locale: locale === 'fa' ? 'fa_IR' : 'en_US',
      alternateLocale: locale === 'fa' ? 'en_US' : 'fa_IR',
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: t('hero.title'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${t('hero.title')} - ${t('hero.subtitle')}`,
      description: t('hero.description'),
      images: ['/og-image.png'],
      creator: '@kiarakraft',
      site: '@kiarakraft',
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
    manifest: '/manifest.json',
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = params;
  setRequestLocale(locale);
  // Ensure messages are loaded for the current locale explicitly
  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: 'home' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tFooter = await getTranslations({ locale, namespace: 'footer' });
  const tCategories = await getTranslations({ locale, namespace: 'categories' });

  // Server-side pre-rendered strings for the Footer so the client Footer can render
  // localized text during SSR without waiting for hydration.
  const serverFooter = {
    about: tFooter('about'),
    contact: tFooter('contact'),
    help: tFooter('help'),
    terms: tFooter('terms'),
    privacy: tFooter('privacy'),
    brandDescription: tFooter('brandDescription'),
    categories: tFooter('categories'),
    legal: tFooter('legal'),
    madeWith: tFooter('madeWith'),
    supportMessage: tFooter('supportMessage'),
    allRightsReserved: tFooter('allRightsReserved'),
  };

  const serverCategories = {
    ceramics: tCategories('ceramics'),
    textiles: tCategories('textiles'),
    jewelry: tCategories('jewelry'),
    woodwork: tCategories('woodwork'),
    painting: tCategories('painting'),
  };

  // Structured data for the organization
  const organizationStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: t('hero.title'),
    description: t('hero.description'),
    url: `https://kiarakraft.com/${locale}`,
    logo: 'https://kiarakraft.com/logo.png',
    sameAs: [
      'https://instagram.com/kiarakraft',
      'https://facebook.com/kiarakraft',
      'https://twitter.com/kiarakraft',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      areaServed: 'IR',
      availableLanguage: ['Persian', 'English']
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'IR',
      addressLocality: 'Tehran',
    }
  };

  // WebSite structured data
  const websiteStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: t('hero.title'),
    url: `https://kiarakraft.com/${locale}`,
    description: t('hero.description'),
    inLanguage: locale === 'fa' ? 'fa-IR' : 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `https://kiarakraft.com/${locale}/explore?search={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };

  const fontClass = locale === 'fa' ? vazirmatn.className : inter.className;

  return (
    <html lang={locale} dir={locale === 'fa' ? 'rtl' : 'ltr'} className={`${inter.variable} ${vazirmatn.variable}`}>
      <head>
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        
        
        {/* Preload LCP image for hero section */}
        <link 
          rel="preload" 
          href="https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1920&h=1080&fit=crop&q=80" 
          as="image"
          fetchPriority="high"
        />
      </head>
      <body className={fontClass}>
        <Providers messages={messages} locale={locale}>
          <StructuredData data={organizationStructuredData} />
          <StructuredData data={websiteStructuredData} />
          <div className="min-h-screen bg-background">
            <a href="#main-content" className="skip-link">
{tCommon('skipToContent')}
            </a>
            <Navbar />
            <main id="main-content" className="flex-1">
              {children}
            </main>
      {/* Pass server locale and pre-rendered footer/category strings so Footer
        can render localized text during SSR without showing translation keys. */}
      <Footer serverLocale={locale} serverFooter={serverFooter} serverCategories={serverCategories} />
          </div>
        </Providers>
      </body>
    </html>
  );
}