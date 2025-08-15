import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/products/RatingStars';
import { AddToCartButton } from '@/components/products/AddToCartButton';
import { formatPrice } from '@/lib/utils';
import { ArrowLeft, Heart, Share2, Store, MapPin } from 'lucide-react';
import type { Metadata } from 'next';

export const revalidate = 60;

type Params = { locale: "fa" | "en"; slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await db.product.findUnique({ 
    where: { slug: params.slug }, 
    select: { title: true, description: true, images: { select: { url: true } } } 
  });
  const title = p?.title ?? (params.locale === "fa" ? "محصول یافت نشد" : "Product Not Found");
  const description = p?.description ?? (params.locale === "fa" ? "این محصول موجود نیست" : "This product does not exist.");
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
  const product = await db.product.findUnique({
    where: { slug: params.slug },
    include: { images: true, seller: true, category: true, reviews: true }
  });
  if (!product) return notFound();

  // Convert Toman to IRR for schema (1 Toman = 10 IRR)
  const tomanToIrr = (t: number) => t * 10;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.images.map(i => i.url),
    brand: "Kiara Kraft",
    offers: {
      "@type": "Offer",
      priceCurrency: "IRR",
      price: String(tomanToIrr(product.priceToman)),
      availability: product.stock > 0 ? "http://schema.org/InStock" : "http://schema.org/OutOfStock"
    }
  };

  const t = await getTranslations('product');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main>
        <h1>{product.title}</h1>
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
                  {product.title}
                </h1>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-3xl font-bold text-primary">
                    {formatPrice(product.priceToman)}
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
                      {product.seller.displayName || product.seller.shopName}
                    </div>
                    {product.seller.region && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {product.seller.region}
                      </div>
                    )}
                  </div>
                </div>
                {product.seller.bio && (
                  <p className="text-sm text-muted-foreground">
                    {product.seller.bio}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold mb-3">{t('description')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium">{t('category')}:</span>
                  <Badge variant="outline">{product.category?.name}</Badge>
                </div>
              </div>

              {/* Purchase Section */}
              {product.stock > 0 && (
                <div className="border-t pt-6 space-y-4">
                  <AddToCartButton product={product} />
                  
                  <div className="flex gap-3">
                    <Button variant="outline" size="lg" className="flex-1">
                      <Heart className="h-4 w-4 mr-2" />
                      Add to Wishlist
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