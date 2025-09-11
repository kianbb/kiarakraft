import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sell' });

  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

export default async function SellPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sell' });

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-lg text-muted-foreground mb-8">{t('subtitle')}</p>
        <Link href={`/${locale}/sell/apply`}>
          <Button size="lg" className="px-8">
            {t('getStarted')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
