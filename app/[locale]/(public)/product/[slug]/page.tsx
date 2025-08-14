import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/products/RatingStars';
import { AddToCartButton } from '@/components/products/AddToCartButton';
import { formatPrice } from '@/lib/utils';
import { ArrowLeft, Heart, Share2, Store, MapPin } from 'lucide-react';

interface PageProps {
  params: {
    slug: string;
    locale: string;
  };
}

async function getProduct(slug: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        images: true,
        category: true,
        seller: {
          include: {
            user: true
          }
        }
      }
    });
    
    return product;
  } catch (error) {
    console.error('Error fetching product:', error);
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps) {
  try {
    const product = await getProduct(params.slug);
    
    if (!product) {
      return {
        title: 'Product Not Found - Kiara Kraft',
        description: 'The product you are looking for was not found.'
      };
    }

    const imageUrl = product.images?.[0]?.url || '/placeholder-product.jpg';
    const canonicalUrl = `https://kiarakraft.com/${params.locale}/product/${params.slug}`;
    const alternateUrls = {
      'fa-IR': `https://kiarakraft.com/fa/product/${params.slug}`,
      'en-US': `https://kiarakraft.com/en/product/${params.slug}`
    };
    
    return {
      metadataBase: new URL('https://kiarakraft.com'),
      title: `${product.title} - Kiara Kraft`,
      description: product.description,
      alternates: {
        canonical: canonicalUrl,
        languages: alternateUrls
      },
      openGraph: {
        title: product.title,
        description: product.description,
        images: [imageUrl],
        type: 'product',
        url: canonicalUrl,
        locale: params.locale === 'fa' ? 'fa_IR' : 'en_US',
        alternateLocale: params.locale === 'fa' ? 'en_US' : 'fa_IR'
      },
      twitter: {
        card: 'summary_large_image',
        title: product.title,
        description: product.description,
        images: [imageUrl]
      }
    };
  } catch (error) {
    return {
      title: 'Error - Kiara Kraft',
      description: 'An error occurred while loading the product.'
    };
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const t = await getTranslations('product');
  
  try {
    const product = await getProduct(params.slug);
    
    if (!product) {
      notFound();
    }

    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          {/* Back Button */}
          <Link href="/explore" className="inline-flex items-center gap-2 mb-6 text-muted-foreground hover:text-foreground">
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
                      {product.seller.displayName || product.seller.user.name}
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
    );
  } catch (error) {
    console.error('Server error in product page:', error);
    throw error; // This will trigger error.tsx
  }
}