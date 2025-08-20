import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface HelpPageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: HelpPageProps): Promise<Metadata> {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'help' });
  
  return {
    title: `${t('title')} – Kiara Kraft`,
    description: t('description')
  };
}

export default async function HelpPage({ params }: HelpPageProps) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'help' });
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">
        {t('subtitle')}
      </p>
      <div className="space-y-4">
        <details className="rounded-md border p-4">
          <summary className="font-medium">{t('faq.howToOrder.question')}</summary>
          <p className="mt-2 text-sm text-muted-foreground">{t('faq.howToOrder.answer')}</p>
        </details>
        <details className="rounded-md border p-4">
          <summary className="font-medium">{t('faq.paymentMethods.question')}</summary>
          <p className="mt-2 text-sm text-muted-foreground">{t('faq.paymentMethods.answer')}</p>
        </details>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        {t('lastUpdated')}: {locale === 'fa' ? '۲۰ آگوست ۲۰۲۵' : 'August 20, 2025'}
      </p>
    </div>
  );
}