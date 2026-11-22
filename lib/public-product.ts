import type { Prisma } from '@prisma/client';

// Use the same publication boundary for direct URLs, discovery and purchase checks.
export const publicProductWhere = {
  active: true,
  isTest: false,
  eligibilityStatus: 'APPROVED',
} satisfies Prisma.ProductWhereInput;

export function isPublicProduct(product: {
  active: boolean;
  isTest: boolean;
  eligibilityStatus: string;
}): boolean {
  return (
    product.active &&
    !product.isTest &&
    product.eligibilityStatus === 'APPROVED'
  );
}

// Seller verification records and contact details are never part of a product DTO.
export const publicSellerSelect = {
  id: true,
  handle: true,
  displayName: true,
  shopName: true,
  verified: true,
  bio: true,
  region: true,
  avatarUrl: true,
} satisfies Prisma.SellerProfileSelect;

export const publicProductSelect = {
  id: true,
  sellerId: true,
  categoryId: true,
  title: true,
  slug: true,
  description: true,
  priceToman: true,
  stock: true,
  active: true,
  isTest: true,
  eligibilityStatus: true,
  ratingAvg: true,
  ratingCount: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  seller: { select: publicSellerSelect },
  category: { select: { id: true, slug: true, name: true } },
  images: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, url: true, alt: true, sortOrder: true },
  },
  translations: {
    select: { locale: true, title: true, description: true },
  },
} satisfies Prisma.ProductSelect;

type PublicProductRecord = Prisma.ProductGetPayload<{
  select: typeof publicProductSelect;
}>;

// Explicit projection also protects serialization if a caller supplies a wider row.
export function toPublicProduct(product: PublicProductRecord, locale = 'fa') {
  const translation = product.translations.find(t => t.locale === locale);
  return {
    id: product.id,
    sellerId: product.sellerId,
    categoryId: product.categoryId,
    title: translation?.title ?? product.title,
    slug: product.slug,
    description: translation?.description ?? product.description,
    priceToman: product.priceToman,
    stock: product.stock,
    active: product.active,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    tags: product.tags,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    seller: {
      id: product.seller.id,
      handle: product.seller.handle,
      displayName: product.seller.displayName,
      shopName: product.seller.shopName,
      verified: product.seller.verified,
      bio: product.seller.bio,
      region: product.seller.region,
      avatarUrl: product.seller.avatarUrl,
    },
    category: product.category
      ? {
          id: product.category.id,
          slug: product.category.slug,
          name: product.category.name,
        }
      : null,
    images: product.images.map(image => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      sortOrder: image.sortOrder,
    })),
  };
}
