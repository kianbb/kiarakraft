import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface AboutPageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });
  
  return {
    title: `${t('title')} – Kiara Kraft`,
    description: t('description')
  };
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">
        {t('subtitle')}
      </p>
      <div className="prose dark:prose-invert">
        <p>
          {t('content')}
        </p>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        {t('lastUpdated')}: {locale === 'fa' ? '۲۰ آگوست ۲۰۲۵' : 'August 20, 2025'}
      </p>
    </div>
  );
}