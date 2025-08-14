import { getMessages } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Providers } from '@/components/providers/Providers';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Metadata } from 'next';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = params;
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
    alternates: {
      canonical: canonicalUrl,
      languages: alternateUrls
    },
    openGraph: {
      title: `${t('hero.title')} - ${t('hero.subtitle')}`,
      description: t('hero.description'),
      url: canonicalUrl,
      siteName: t('hero.title'),
      locale: locale === 'fa' ? 'fa_IR' : 'en_US',
      alternateLocale: locale === 'fa' ? 'en_US' : 'fa_IR',
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title: `${t('hero.title')} - ${t('hero.subtitle')}`,
      description: t('hero.description')
    }
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = params;
  const messages = await getMessages();

  return (
    <Providers messages={messages} locale={locale}>
      <div className="min-h-screen bg-background">
        <a href="#main-content" className="skip-link">
          {locale === 'fa' ? 'پرش به محتوای اصلی' : 'Skip to main content'}
        </a>
        <Navbar />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </Providers>
  );
}