'use client';

import { useEffect } from 'react';
import { trackProductView } from '@/lib/analytics';

interface ProductViewTrackerProps {
  slug: string;
  locale: string;
}

export function ProductViewTracker({ slug, locale }: ProductViewTrackerProps) {
  useEffect(() => {
    // Track product view after hydration
    trackProductView(slug, locale);
  }, [slug, locale]);

  return null;
}
