import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Package, ArrowLeft, Search } from 'lucide-react';

export default async function ProductNotFound() {
  const t = await getTranslations('product');
  const locale = await getLocale();

  return (
    <div className="min-h-screen flex items-center justify-center py-8">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-md mx-auto">
          {/* Icon */}
          <div className="mb-8">
            <Package className="h-24 w-24 mx-auto text-muted-foreground/50" />
          </div>

          {/* Message */}
          <h1 className="text-3xl font-bold mb-4">{t('notFound')}</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            {t('notFoundDescription')}
          </p>

          {/* Actions */}
          <div className="space-y-3">
            <Link href={`/${locale}/explore`} className="block">
              <Button className="w-full" size="lg">
                <Search className="h-4 w-4 mr-2" />
                {t('backToExplore')}
              </Button>
            </Link>
            
            <Link href={`/${locale}`} className="block">
              <Button variant="outline" className="w-full" size="lg">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('goToHomepage')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}