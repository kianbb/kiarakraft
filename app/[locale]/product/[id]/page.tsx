'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuantitySelector } from '@/components/products/QuantitySelector';
import { RatingStars } from '@/components/products/RatingStars';
import { formatPrice } from '@/lib/utils';
import { ArrowLeft, Heart, Share2, Store, MapPin } from 'lucide-react';

export default function ProductDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const t = useTranslations('product');
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    fetchProduct();
  }, [params.id]);

  const fetchProduct = async () => {
    try {
      const response = await fetch(`/api/products/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async () => {
    if (!session) {
      // Redirect to login
      window.location.href = '/auth/login';
      return;
    }

    setAddingToCart(true);
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity
        })
      });

      if (response.ok) {
        // Show success message
        alert(t('addedToCart'));
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="bg-gray-200 h-96 rounded-lg mb-8"></div>
            <div className="bg-gray-200 h-8 rounded mb-4"></div>
            <div className="bg-gray-200 h-6 rounded w-2/3 mb-8"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold mb-4">{t('notFound')}</h1>
          <Link href="/explore">
            <Button>{t('backToExplore')}</Button>
          </Link>
        </div>
      </div>
    );
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
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
              />
            </div>
          </div>

          {/* Product Details */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                {product.name}
              </h1>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="text-3xl font-bold text-primary">
                  {formatPrice(product.price)}
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
                    {product.seller.sellerProfile?.displayName || product.seller.name}
                  </div>
                  {product.seller.sellerProfile?.region && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {product.seller.sellerProfile.region}
                    </div>
                  )}
                </div>
              </div>
              {product.seller.sellerProfile?.bio && (
                <p className="text-sm text-muted-foreground">
                  {product.seller.sellerProfile.bio}
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

            {/* Category and Tags */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium">{t('category')}:</span>
                <Badge variant="outline">{product.category}</Badge>
              </div>
              
              {product.tags && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('tags')}:</span>
                  <div className="flex flex-wrap gap-1">
                    {product.tags.split(',').map((tag: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Purchase Section */}
            {product.stock > 0 && (
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {t('quantity')}
                    </label>
                    <QuantitySelector
                      value={quantity}
                      onChange={setQuantity}
                      max={Math.min(product.stock, 10)}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {product.stock} {t('available')}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleAddToCart}
                    disabled={addingToCart}
                    className="flex-1"
                    size="lg"
                  >
                    {addingToCart ? t('adding') : t('addToCart')}
                  </Button>
                  
                  <Button variant="outline" size="lg">
                    <Heart className="h-4 w-4" />
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
}