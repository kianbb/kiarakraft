'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Heart, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatingStars } from '@/components/products/RatingStars';
import { Price } from '@/components/ui/price';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    slug: string;
    description: string;
    priceToman: number;
    stock: number;
    images: { url: string; alt?: string }[];
    seller: {
      displayName: string;
      shopName: string;
    };
  };
  compact?: boolean;
  className?: string;
}

export const ProductCard = React.memo(function ProductCard({ product, compact = false, className }: ProductCardProps) {
  const locale = useLocale();
  const t = useTranslations('common');
  
  const productUrl = `/${locale}/product/${product.slug}`;
  const mainImage = product.images[0]?.url || '/placeholder-product.jpg';
  const isOutOfStock = product.stock === 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // TODO: Implement add to cart functionality
    // Will be implemented when AddToCartButton is integrated
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // TODO: Implement favorite functionality
    // Will be implemented when favorites system is added
  };

  return (
    <Link href={productUrl} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg">
      <article className={cn(
        'group bg-card border border-border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1',
        compact ? 'max-w-sm' : 'max-w-sm',
        className
      )} aria-labelledby={`product-title-${product.id}`}>
        {/* Image Section */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={mainImage}
            alt={product.images[0]?.alt || product.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={false}
            quality={85}
            placeholder="blur"
            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
          />
          
          {/* Overlay Actions */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              className="w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm"
              onClick={handleToggleFavorite}
              aria-label={`Add ${product.title} to favorites`}
            >
              <Heart className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Stock Status */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-medium bg-destructive px-3 py-1 rounded-full text-sm">
                {t('outOfStock')}
              </span>
            </div>
          )}

          {/* Low Stock Warning */}
          {!isOutOfStock && product.stock <= 3 && (
            <div className="absolute top-2 left-2">
              <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                {`${product.stock} ${t('leftInStock')}`}
              </span>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-4">
          {/* Seller Info */}
          <div className="text-xs text-muted-foreground mb-1">
            {product.seller.displayName}
          </div>

          {/* Title */}
          <h3 id={`product-title-${product.id}`} className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {product.title}
          </h3>

          {/* Description */}
          {!compact && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {product.description}
            </p>
          )}

          {/* Rating - Placeholder for now */}
          <div className="mt-2">
            <RatingStars rating={4.5} size="sm" />
          </div>

          {/* Price and Actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex flex-col">
              <Price amount={product.priceToman} className="text-lg font-bold text-foreground" />
            </div>

            <Button
              size="sm"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="min-w-[40px]"
              aria-label={`Add ${product.title} to cart`}
            >
              <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </article>
    </Link>
  );
});