import { unstable_cache } from 'next/cache';
import { revalidateTag } from 'next/cache';

/**
 * Cache tags for different data types
 */
export const CACHE_TAGS = {
  PRODUCTS: 'products',
  PRODUCT: 'product',
  SELLERS: 'sellers',
  SELLER: 'seller',
  CATEGORIES: 'categories',
  REVIEWS: 'reviews',
  ORDERS: 'orders',
} as const;

/**
 * Cache durations in seconds
 */
export const CACHE_DURATIONS = {
  SHORT: 300, // 5 minutes
  MEDIUM: 1800, // 30 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
} as const;

/**
 * Create a cached function with proper tags
 */
export function createCachedFunction<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  tags: string[],
  revalidate: number = CACHE_DURATIONS.MEDIUM
) {
  return unstable_cache(fn, undefined, {
    tags,
    revalidate,
  });
}

/**
 * Revalidate cache for specific entities
 */
export async function revalidateProduct(productId: string) {
  revalidateTag(CACHE_TAGS.PRODUCTS, {});
  revalidateTag(`${CACHE_TAGS.PRODUCT}:${productId}`, {});
}

export async function revalidateSeller(sellerId: string) {
  revalidateTag(CACHE_TAGS.SELLERS, {});
  revalidateTag(`${CACHE_TAGS.SELLER}:${sellerId}`, {});
}

export async function revalidateProductsForSeller(sellerId: string) {
  revalidateTag(CACHE_TAGS.PRODUCTS, {});
  revalidateTag(`${CACHE_TAGS.SELLER}:${sellerId}`, {});
}

export async function revalidateReviews(productId?: string) {
  revalidateTag(CACHE_TAGS.REVIEWS, {});
  if (productId) {
    revalidateTag(`${CACHE_TAGS.PRODUCT}:${productId}`, {});
  }
}

export async function revalidateCategories() {
  revalidateTag(CACHE_TAGS.CATEGORIES, {});
}

/**
 * Cache key generators
 */
export function getCacheKey(
  prefix: string,
  ...args: (string | number)[]
): string {
  return `${prefix}:${args.join(':')}`;
}

/**
 * Cache wrapper for database queries
 */
export function withCache<T extends unknown[], R>(
  name: string,
  tags: string[],
  revalidate: number = CACHE_DURATIONS.MEDIUM
) {
  return function (fn: (...args: T) => Promise<R>) {
    return createCachedFunction(fn, tags, revalidate);
  };
}
