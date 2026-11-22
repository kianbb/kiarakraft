'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { RatingStars } from '@/components/products/RatingStars';
import type { ProductRatingSummary } from '@/lib/product-ratings';
import { cn } from '@/lib/utils';

export function ProductRating({
  rating,
  size = 'md',
  className,
}: {
  rating: ProductRatingSummary;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('product');
  const format = useFormatter();
  const average = format.number(rating.average, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 text-muted-foreground',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className
      )}
    >
      <div aria-hidden="true">
        <RatingStars rating={Math.round(rating.average * 2) / 2} size={size} />
      </div>
      <span>{t('ratingSummary', { average, count: rating.count })}</span>
    </div>
  );
}
