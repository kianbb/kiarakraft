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
import { formatPrice } from '@/lib/utils';
import { ArrowLeft, Heart, Share2, Store, MapPin } from 'lucide-react';
import type { Metadata } from 'next';

// Disable caching temporarily to ensure locale fixes take effect immediately
export const revalidate = 0;

type Params = { locale: "fa" | "en"; slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  setRequestLocale(params.locale);
  
  const [p, tProduct, tHome] = await Promise.all([
    db.product.findUnique({ 
      where: { slug: params.slug }, 
      select: { title: true, description: true, images: { select: { url: true } } } 
    }),
    getTranslations({ locale: params.locale, namespace: 'product' }),
    // For demo products, use homepage translations to localize name/description in EN
    getTranslations({ locale: params.locale, namespace: 'home' })
  ]);

  // Localize demo products that were seeded in Persian-only
  let title = p?.title ?? tProduct('notFound');
  let description = p?.description ?? tProduct('notFoundDescription');
  if (params.locale === 'en') {
    if (params.slug === 'handmade-ceramic-bowl') {
      title = tHome('sampleProducts.ceramicBowl.title');
      description = tHome('sampleProducts.ceramicBowl.description');
    } else if (params.slug === 'silver-turquoise-necklace') {
      title = tHome('sampleProducts.silverNecklace.title');
      description = tHome('sampleProducts.silverNecklace.description');
    }
  }
  const base = "https://www.kiarakraft.com";
  const path = `/${params.locale}/product/${params.slug}`;
  return {
    title, 
    description,
    alternates: {
      canonical: `${base}${path}`,
      languages: { "fa-IR": `${base}/fa/product/${params.slug}`, "en-US": `${base}/en/product/${params.slug}` }
    },
    openGraph: { 
      title, 
      description, 
      type: "website", 
      images: p?.images?.[0]?.url ? [p.images[0].url] : [] 
    }
  };
}

export default async function Page({ params }: { params: Params }) {
  setRequestLocale(params.locale);
  
  const product = await db.product.findUnique({
    where: { slug: params.slug },
    include: { images: true, seller: true, category: true, reviews: true }
  });
  
  if (!product) {
    return notFound();
  }

  // Convert Toman to IRR for schema (1 Toman = 10 IRR)
  const tomanToIrr = (t: number) => t * 10;

  const [t, tCategories, tHome] = await Promise.all([
    getTranslations({ locale: params.locale, namespace: 'product' }),
    getTranslations({ locale: params.locale, namespace: 'categories' }),
    getTranslations({ locale: params.locale, namespace: 'home' })
  ]);

  // Localized fields for demo products (DB currently Persian).
  // Try to load persisted EN translation if available (works after migration)
  let translatedTitle: string | undefined;
  let translatedDescription: string | undefined;
  if (params.locale === 'en') {
    try {
      type ProductTranslationClient = {
        productTranslation: {
          findUnique: (args: { where: { productId_locale: { productId: string; locale: string } } }) => Promise<{ title: string; description: string } | null>
        }
      };
      const tr = await (db as unknown as ProductTranslationClient).productTranslation.findUnique({
        where: { productId_locale: { productId: product.id, locale: 'en' } }
      });
      if (tr) {
        translatedTitle = tr.title;
        translatedDescription = tr.description;
      }
    } catch {}

    // If no persisted EN translation exists, attempt on-the-fly translation as a graceful fallback
    if (!translatedTitle || !translatedDescription) {
      const hasPersian = /[\u0600-\u06FF]/.test(product.title) || /[\u0600-\u06FF]/.test(product.description);
      if (hasPersian) {
        try {
          const en = await translateProductFields({ title: product.title, description: product.description }, 'fa', 'en');
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
  sellerBio: product.seller.bio ?? undefined
  };
  if (params.locale === 'en') {
    if (product.slug === 'handmade-ceramic-bowl') {
      localized.title = tHome('sampleProducts.ceramicBowl.title');
      localized.description = tHome('sampleProducts.ceramicBowl.description');
    } else if (product.slug === 'silver-turquoise-necklace') {
      localized.title = tHome('sampleProducts.silverNecklace.title');
      localized.description = tHome('sampleProducts.silverNecklace.description');
    }
  // Ensure category is localized even if DB name is Persian
    // Category label should be localized regardless of seed data
    if (product.category?.slug) {
      localized.categoryName = tCategories(product.category.slug as unknown as string);
    }
    // Seller fields: use English display name for demo, transliterate simple region, hide Persian bio
    localized.sellerDisplayName = tHome('sampleProducts.shopName');
    if (product.seller.region === 'تهران') localized.sellerRegion = 'Tehran';
    // If bio contains Persian characters, omit it on EN
    if (/[\u0600-\u06FF]/.test(product.seller.bio || '')) {
      localized.sellerBio = undefined;
    }
  } else {
    if (product.category?.slug) {
      // Always prefer i18n category labels over DB mixed-language names
      localized.categoryName = tCategories(product.category.slug as unknown as string);
    }
  }

  // Build localized JSON-LD after computing localized fields
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: localized.title,
    description: localized.description,
    image: product.images.map((i) => i.url),
    brand: "Kiara Kraft",
    offers: {
      "@type": "Offer",
      priceCurrency: "IRR",
      price: String(tomanToIrr(product.priceToman)),
      availability: product.stock > 0 ? "http://schema.org/InStock" : "http://schema.org/OutOfStock"
    }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main>
  <h1>{localized.title}</h1>
        {/* render gallery + details */}
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          {/* Back Button */}
          <Link href={`/${params.locale}/explore`} className="inline-flex items-center gap-2 mb-6 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t('backToExplore')}
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Product Images */}
            <div className="space-y-4">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={product.images?.[0]?.url || '/placeholder-product.jpg'}
                  alt={product.images?.[0]?.alt || product.title}
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
                    {formatPrice(product.priceToman, params.locale)}
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
                      {localized.sellerDisplayName}
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
                <h3 className="text-lg font-semibold mb-3">{t('description')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {localized.description}
                </p>
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium">{t('category')}:</span>
                  <Badge variant="outline">{localized.categoryName}</Badge>
                </div>
              </div>

              {/* Purchase Section */}
              {product.stock > 0 && (
                <div className="border-t pt-6 space-y-4">
                  <AddToCartButton product={product} />
                  
                  <div className="flex gap-3">
                    <Button variant="outline" size="lg" className="flex-1">
                      <Heart className="h-4 w-4 mr-2" />
                      {t('addToWishlist')}
                    </Button>
                    
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