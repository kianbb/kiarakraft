import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getUserWishlist } from '@/lib/actions/wishlist';
import { ProductCard } from '@/components/products/ProductCard';
import { Heart, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface WishlistPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({
  params,
}: WishlistPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wishlist' });

  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

export default async function WishlistPage({ params }: WishlistPageProps) {
  const { locale } = await params;
  const t = await getTranslations('wishlist');
  const wishlistItems = await getUserWishlist();

  const isRTL = locale === 'fa';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Heart className="h-8 w-8 text-red-500" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-gray-600">
              {t('subtitle', { count: wishlistItems.length })}
            </p>
          </div>
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-700">
            {t('home')}
          </Link>
          <span>{isRTL ? '←' : '→'}</span>
          <Link href="/account" className="hover:text-gray-700">
            {t('account')}
          </Link>
          <span>{isRTL ? '←' : '→'}</span>
          <span className="text-gray-900">{t('wishlist')}</span>
        </nav>
      </div>

      {wishlistItems.length === 0 ? (
        <div className="text-center py-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gray-100 rounded-full">
              <Heart className="h-12 w-12 text-gray-400" />
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            {t('empty.title')}
          </h2>

          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            {t('empty.description')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/explore">
              <Button className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                {t('empty.exploreProducts')}
              </Button>
            </Link>

            <Link href="/">
              <Button variant="outline">{t('empty.backToHome')}</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-6">
            <p className="text-gray-600">
              {t('itemCount', { count: wishlistItems.length })}
            </p>

            {/* Future: Add bulk actions like "Remove all" */}
            <div className="flex gap-2">
              <Link href="/explore">
                <Button variant="outline" size="sm">
                  {t('continueShopping')}
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {wishlistItems.map(item => {
              // Transform wishlist item to match ProductCard interface
              const product = {
                ...item.product,
                images: item.product.images.map(img => ({
                  url: img.url,
                  alt: img.alt || undefined,
                })),
              };

              return (
                <div key={item.id} className="relative">
                  <ProductCard
                    product={product}
                    showWishlistButton={true}
                    locale={locale}
                  />

                  {/* Added to wishlist indicator */}
                  <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {t('saved')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination could be added here for large wishlists */}
          {wishlistItems.length >= 20 && (
            <div className="mt-12 flex justify-center">
              <p className="text-gray-500 text-sm">{t('showingFirst20')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
