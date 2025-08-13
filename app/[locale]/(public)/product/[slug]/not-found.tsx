import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Package, ArrowLeft, Search } from 'lucide-react';

export default async function ProductNotFound() {
  const t = await getTranslations('product');

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
            The product you're looking for doesn't exist or may have been removed. 
            Please check the URL or explore our other amazing handcrafted items.
          </p>

          {/* Actions */}
          <div className="space-y-3">
            <Link href="/explore" className="block">
              <Button className="w-full" size="lg">
                <Search className="h-4 w-4 mr-2" />
                {t('backToExplore')}
              </Button>
            </Link>
            
            <Link href="/" className="block">
              <Button variant="outline" className="w-full" size="lg">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go to Homepage
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}