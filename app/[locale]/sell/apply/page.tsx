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
    title: t('applyPageTitle'),
    description: t('applyPageDescription'),
  };
}

export default async function SellApplyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sell' });

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">{t('applyTitle')}</h1>
        <p className="text-lg text-muted-foreground mb-8">
          {t('applySubtitle')}
        </p>
        <div className="bg-muted/50 p-8 rounded-lg">
          <p className="text-muted-foreground">{t('applyComingSoon')}</p>
        </div>
        <Link href={`/${locale}/sell`} className="inline-block mt-6">
          <Button variant="outline">{t('backToSell')}</Button>
        </Link>
      </div>
    </div>
  );
}
