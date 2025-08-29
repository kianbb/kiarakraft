import {
  searchProducts as originalSearchProducts,
  SearchFilters,
} from '@/lib/search';
import { CACHE_TAGS, CACHE_DURATIONS, createCachedFunction } from '@/lib/cache';

/**
 * Cached version of searchProducts for better performance
 */
export const searchProducts = createCachedFunction(
  async (filters: SearchFilters) => {
    return originalSearchProducts(filters);
  },
  [CACHE_TAGS.PRODUCTS, CACHE_TAGS.CATEGORIES],
  CACHE_DURATIONS.MEDIUM // 30 minutes cache
);

/**
 * Cached featured products for homepage
 */
export const getFeaturedProducts = createCachedFunction(
  async (locale: string) => {
    const results = await originalSearchProducts({
      sortBy: 'newest',
      limit: 4,
      locale,
    });

    return results.products.map(product => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      priceToman: product.priceToman,
      stock: product.stock,
      images: product.images.map(img => ({
        url: img.url,
        alt: img.alt || product.title,
      })),
      seller: {
        handle: product.seller.handle,
        displayName: product.seller.displayName,
        shopName: product.seller.shopName,
        verified: product.seller.verified,
      },
    }));
  },
  [CACHE_TAGS.PRODUCTS],
  CACHE_DURATIONS.LONG // 1 hour cache for featured products
);

/**
 * Cached shop products for seller pages
 */
export const getShopProducts = createCachedFunction(
  async (handle: string, locale: string, limit: number = 12) => {
    return originalSearchProducts({
      sellerId: handle, // Note: search uses handle as sellerId filter
      locale,
      limit,
      sortBy: 'newest',
    });
  },
  [CACHE_TAGS.PRODUCTS, CACHE_TAGS.SELLERS],
  CACHE_DURATIONS.MEDIUM
);
