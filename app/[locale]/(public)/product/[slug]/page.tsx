import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { db } from '@/lib/db';
import { translateProductFields } from '@/lib/translator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/products/RatingStars';
import { AddToCartButton } from '@/components/products/AddToCartButton';
import { PriceWithFx } from '@/components/ui/price-with-fx';
import { ProductJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArrowLeft, Share2, Store, MapPin } from 'lucide-react';
import { WishlistButton } from '@/components/wishlist/WishlistButton';
import { ProductViewTracker } from '@/components/analytics/ProductViewTracker';
import type { Metadata } from 'next';

// Revalidate pages periodically to pick up product changes
export const revalidate = 60;
// Allow dynamic params so new products work without rebuilding
export const dynamicParams = true;

export async function generateStaticParams() {
  // Skip static generation if DATABASE_URL is not available (e.g., CI without secrets)
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set, skipping static params generation');
    return [];
  }

  try {
    const products = await db.product.findMany({
      where: { active: true, isTest: false },
      select: { slug: true },
    });
    const locales: Array<'fa' | 'en'> = ['fa', 'en'];
    return products.flatMap(p =>
      locales.map(locale => ({ slug: p.slug, locale }))
    );
  } catch (error) {
    console.warn('Database unavailable during static generation:', error);
    // Return empty array - pages will be generated dynamically at request time
    return [];
  }
}

type Params = Promise<{ locale: 'fa' | 'en'; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [p, tProduct, tHome] = await Promise.all([
    db.product.findFirst({
      where: { slug, isTest: false },
      select: {
        title: true,
        description: true,
        images: { select: { url: true } },
      },
    }),
    getTranslations({ locale, namespace: 'product' }),
    // For demo products, use homepage translations to localize name/description in EN
    getTranslations({ locale, namespace: 'home' }),
  ]);

  // If product does not exist, avoid throwing notFound() here to prevent potential soft 404s.
  // The page component below will throw notFound() and ensure a proper 404 status.
  if (!p) {
    return {
      title: tProduct('notFound'),
      description: tProduct('notFoundDescription'),
      robots: { index: false, follow: false },
    };
  }

  // Localize demo products that were seeded in Persian-only
  let title = p?.title ?? tProduct('notFound');
  let description = p?.description ?? tProduct('notFoundDescription');
  if (locale === 'en') {
    if (slug === 'handmade-ceramic-bowl') {
      title = tHome('sampleProducts.ceramicBowl.title');
      description = tHome('sampleProducts.ceramicBowl.description');
    } else if (slug === 'silver-turquoise-necklace') {
      title = tHome('sampleProducts.silverNecklace.title');
      description = tHome('sampleProducts.silverNecklace.description');
    } else {
      // Final guard: if text still appears Persian, keep the original instead of generating generic names
      const hasFa = (s?: string) => /[\u0600-\u06FF]/.test(s || '');
      // Don't modify the title if it contains Persian - better to show Persian than "Product xyz"
      if (hasFa(description)) {
        description = tHome('hero.description');
      }
    }
  }
  const base = 'https://www.kiarakraft.com';
  const path = `/${locale}/product/${slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: `${base}${path}`,
      languages: {
        'fa-IR': `${base}/fa/product/${slug}`,
        'en-US': `${base}/en/product/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      images: p?.images?.[0]?.url ? [p.images?.[0]?.url] : [],
    },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // Fetch the product directly - let the actual query determine if it exists
  const product = await db.product.findFirst({
    where: { slug, isTest: false },
    include: {
      images: {
        orderBy: { sortOrder: 'asc' },
      },
      seller: true,
      category: true,
      reviews: true,
    },
  });

  // Return 404 if product doesn't exist, is inactive, or is a test product
  if (!product || !product.active || product.isTest) {
    notFound();
  }

  const [t, tCategories, tHome] = await Promise.all([
    getTranslations({ locale: locale, namespace: 'product' }),
    getTranslations({ locale: locale, namespace: 'categories' }),
    getTranslations({ locale: locale, namespace: 'home' }),
  ]);

  // Localized fields for demo products (DB currently Persian).
  // Try to load persisted EN translation if available (works after migration)
  let translatedTitle: string | undefined;
  let translatedDescription: string | undefined;
  if (locale === 'en') {
    try {
      type ProductTranslationClient = {
        productTranslation: {
          findUnique: (args: {
            where: { productId_locale: { productId: string; locale: string } };
          }) => Promise<{ title: string; description: string } | null>;
        };
      };
      const tr = await (
        db as unknown as ProductTranslationClient
      ).productTranslation.findUnique({
        where: { productId_locale: { productId: product.id, locale: 'en' } },
      });
      if (tr) {
        translatedTitle = tr.title;
        translatedDescription = tr.description;
      }
    } catch {}

    // If no persisted EN translation exists, attempt on-the-fly translation as a graceful fallback
    if (!translatedTitle || !translatedDescription) {
      const hasPersian =
        /[\u0600-\u06FF]/.test(product.title) ||
        /[\u0600-\u06FF]/.test(product.description);
      if (hasPersian) {
        try {
          const en = await translateProductFields(
            { title: product.title, description: product.description },
            'fa',
            'en'
          );
          translatedTitle = translatedTitle || en.title;
          translatedDescription = translatedDescription || en.description;
        } catch {
          // Ignore translation errors and keep Persian as last resort
        }
      }
    }
  }

  const localized = {
    title: translatedTitle ?? product.title,
    description: translatedDescription ?? product.description,
    categoryName: product.category?.name ?? '',
    sellerDisplayName: product.seller.displayName || product.seller.shopName,
    sellerRegion: product.seller.region ?? undefined,
    sellerBio: product.seller.bio ?? undefined,
  };

  // For English locale, use handle as shop name if the shop name is in Persian
  // This provides consistency across locales
  if (locale === 'en' && localized.sellerDisplayName) {
    const hasPersian = /[\u0600-\u06FF]/.test(localized.sellerDisplayName);
    if (hasPersian && product.seller.handle) {
      // Use the handle (e.g., 'kian-store') as a readable English alternative
      localized.sellerDisplayName = product.seller.handle
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }
  if (locale === 'en') {
    if (product.slug === 'handmade-ceramic-bowl') {
      localized.title = tHome('sampleProducts.ceramicBowl.title');
      localized.description = tHome('sampleProducts.ceramicBowl.description');
    } else if (product.slug === 'silver-turquoise-necklace') {
      localized.title = tHome('sampleProducts.silverNecklace.title');
      localized.description = tHome(
        'sampleProducts.silverNecklace.description'
      );
    }
    // Final guard: hide Persian-only description/title if translation still not available
    const hasFa = (s?: string) => /[\u0600-\u06FF]/.test(s || '');
    if (hasFa(localized.description)) {
      localized.description = '';
    }
    if (hasFa(localized.title)) {
      localized.title = product.slug
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    // Ensure category is localized even if DB name is Persian
    // Category label should be localized regardless of seed data
    if (product.category?.slug) {
      localized.categoryName = tCategories(
        product.category.slug as unknown as string
      );
    }
    // Transliterate simple region names
    if (product.seller.region === 'تهران') localized.sellerRegion = 'Tehran';
    // If bio contains Persian characters, omit it on EN
    if (/[\u0600-\u06FF]/.test(product.seller.bio || '')) {
      localized.sellerBio = undefined;
    }
  } else {
    if (product.category?.slug) {
      // Always prefer i18n category labels over DB mixed-language names
      localized.categoryName = tCategories(
        product.category.slug as unknown as string
      );
    }
  }

  return (
    <>
      <ProductViewTracker slug={slug} locale={locale} />
      <ProductJsonLd
        product={{
          title: localized.title,
          description: localized.description,
          priceToman: product.priceToman,
          images: product.images.map(img => ({
            url: img.url,
            alt: img.alt || undefined,
          })),
          seller: {
            displayName: product.seller.displayName,
            handle: product.seller.handle!,
          },
          ratingAvg: product.ratingAvg,
          ratingCount: product.ratingCount,
          slug: product.slug,
        }}
        locale={locale}
      />
      <BreadcrumbJsonLd
        items={(() => {
          const base = 'https://www.kiarakraft.com';
          const items = [
            {
              name: locale === 'fa' ? 'خانه' : 'Home',
              url: `${base}/${locale}`,
              position: 1,
            },
          ];
          if (product.category?.slug) {
            items.push({
              name:
                locale === 'fa'
                  ? localized.categoryName || 'دسته بندی'
                  : localized.categoryName || 'Category',
              url: `${base}/${locale}/explore?category=${product.category.slug}`,
              position: 2,
            });
            items.push({
              name: localized.title,
              url: `${base}/${locale}/product/${product.slug}`,
              position: 3,
            });
          } else {
            items.push({
              name: localized.title,
              url: `${base}/${locale}/product/${product.slug}`,
              position: 2,
            });
          }
          return items;
        })()}
      />
      <main>
        {/* render gallery + details */}
        <div className="min-h-screen py-8">
          <div className="container mx-auto px-4">
            {/* Back Button */}
            <Link
              href={`/${locale}/explore`}
              className="inline-flex items-center gap-2 mb-6 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('backToExplore')}
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Product Images */}
              <div className="space-y-4">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <Image
                    src={product.images?.[0]?.url || '/placeholder-product.jpg'}
                    alt={product.images?.[0]?.alt || localized.title}
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>

              {/* Product Details */}
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold mb-4">
                    {localized.title}
                  </h1>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-3xl font-bold text-primary">
                      <PriceWithFx
                        amount={product.priceToman}
                        showConversions={true}
                      />
                    </div>
                    {product.stock > 0 ? (
                      <Badge variant="secondary">{t('inStock')}</Badge>
                    ) : (
                      <Badge variant="destructive">{t('outOfStock')}</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <RatingStars rating={4.5} />
                    <span className="text-sm text-muted-foreground">
                      (4.5) • 23 {t('reviews')}
                    </span>
                  </div>
                </div>

                {/* Seller Info */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Store className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">
                        {product.seller.handle ? (
                          <Link
                            href={`/${locale}/shop/${product.seller.handle}`}
                            className="hover:text-primary transition-colors cursor-pointer"
                          >
                            {localized.sellerDisplayName}
                          </Link>
                        ) : (
                          localized.sellerDisplayName
                        )}
                      </div>
                      {localized.sellerRegion && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {localized.sellerRegion}
                        </div>
                      )}
                    </div>
                  </div>
                  {localized.sellerBio && (
                    <p className="text-sm text-muted-foreground">
                      {localized.sellerBio}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    {t('description')}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {localized.description}
                  </p>
                </div>

                {/* Category */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium">
                      {t('category')}:
                    </span>
                    <Badge variant="outline">{localized.categoryName}</Badge>
                  </div>
                </div>

                {/* Tags */}
                {product.tags &&
                  (() => {
                    // Handle both formats: simple array or object with language keys
                    let tagsToDisplay: string[] = [];

                    if (Array.isArray(product.tags)) {
                      // Old format: simple array of Persian tags
                      tagsToDisplay = product.tags as string[];
                    } else if (
                      typeof product.tags === 'object' &&
                      product.tags !== null
                    ) {
                      // New format: object with fa/en keys
                      const tagsObj = product.tags as {
                        fa?: string[];
                        en?: string[];
                      };
                      if (
                        locale === 'en' &&
                        tagsObj.en &&
                        tagsObj.en.length > 0
                      ) {
                        tagsToDisplay = tagsObj.en;
                      } else if (tagsObj.fa) {
                        tagsToDisplay = tagsObj.fa;
                      }
                    }

                    return tagsToDisplay.length > 0 ? (
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {t('tags')}:
                          </span>
                          {tagsToDisplay.map((tag, index) => (
                            <Link
                              key={index}
                              href={`/${locale}/explore?q=${encodeURIComponent(tag)}`}
                              className="inline-block"
                            >
                              <Badge
                                variant="secondary"
                                className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                              >
                                {tag.replace(/_/g, ' ')}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                {/* Purchase Section */}
                {product.stock > 0 && (
                  <div className="border-t pt-6 space-y-4">
                    <AddToCartButton product={product} />

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <WishlistButton
                          productId={product.id}
                          initialIsInWishlist={false}
                          variant="large"
                          className="w-full h-12 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                        />
                      </div>

                      <Button variant="outline" size="lg">
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
