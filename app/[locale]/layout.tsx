import { getMessages } from 'next-intl/server';
import { Providers } from '@/components/providers/Providers';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export default async function LocaleLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: { locale: string };
}>) {
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