import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

interface RawSearchResult {
  id: string;
  title: string;
  slug: string;
  description: string;
  priceToman: number;
  stock: number;
  active: boolean;
  eligibilityStatus: string;
  createdAt: Date;
  updatedAt: Date;
  seller_id: string;
  seller_handle: string | null;
  seller_display_name: string;
  seller_shop_name: string;
  seller_verified: boolean;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  relevance: number;
}

export interface SearchFilters {
  query?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sellerId?: string;
  verifiedOnly?: boolean;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'oldest';
  page?: number;
  limit?: number;
  locale?: string;
}

export interface SearchResult {
  products: Array<{
    id: string;
    title: string;
    slug: string;
    description: string;
    priceToman: number;
    stock: number;
    active: boolean;
    eligibilityStatus: string;
    createdAt: Date;
    updatedAt: Date;
    images: Array<{
      url: string;
      alt: string | null;
    }>;
    seller: {
      id: string;
      handle: string | null;
      displayName: string;
      shopName: string;
      verified: boolean;
    };
    category: {
      id: string;
      name: string;
      slug: string;
    } | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    pages: number; // Add this for backward compatibility
    hasNext: boolean;
    hasPrev: boolean;
  };
  facets?: {
    categories: Array<{ id: string; name: string; count: number }>;
    priceRanges: Array<{ min: number; max: number; count: number }>;
    verifiedSellers: number;
  };
}

/**
 * Validate search input to prevent injection attacks
 */
function validateSearchInput(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('Search query must be a string');
  }

  const sanitized = input.trim();

  // Length validation
  if (sanitized.length === 0) {
    return '';
  }

  if (sanitized.length > 200) {
    throw new Error('Search query too long (max 200 characters)');
  }

  // Pattern validation - allow letters, numbers, spaces, and common punctuation
  if (
    !/^[\p{L}\p{N}\s\-_.,!?'"()\[\]{}+=@#$%&*<>/:;|\\~`^]+$/u.test(sanitized)
  ) {
    throw new Error('Search query contains invalid characters');
  }

  return sanitized;
}

export async function searchProducts(
  filters: SearchFilters = {}
): Promise<SearchResult> {
  const {
    query,
    categoryId,
    minPrice,
    maxPrice,
    sellerId,
    verifiedOnly,
    sortBy = 'relevance',
    page = 1,
    limit = 20,
    locale = 'fa',
  } = filters;

  // Input validation
  const searchQuery = query ? validateSearchInput(query) : '';
  const validLocale = ['fa', 'en'].includes(locale) ? locale : 'fa';
  const validLimit = Math.min(Math.max(1, limit), 100); // Max 100 results per page
  const validPage = Math.max(1, page);
  const offset = (validPage - 1) * validLimit;

  // Validate numeric inputs
  const validMinPrice = minPrice && minPrice > 0 ? minPrice : null;
  const validMaxPrice = maxPrice && maxPrice > 0 ? maxPrice : null;

  // Validate IDs (should be cuid format)
  const cuidPattern = /^[a-z0-9]{25}$/i;
  const validCategoryId =
    categoryId && cuidPattern.test(categoryId) ? categoryId : null;
  const validSellerId =
    sellerId && cuidPattern.test(sellerId) ? sellerId : null;

  let products;
  let total;
  let facets;

  if (searchQuery && searchQuery.length > 0) {
    // Use secure advanced search with Prisma.sql template literals
    const searchSql = Prisma.sql`
      SELECT
        p.*,
        COALESCE(pt.title, p.title) as title,
        COALESCE(pt.description, p.description) as description,
        sp.id as seller_id,
        sp."handle" as seller_handle,
        sp."displayName" as seller_display_name,
        sp."shopName" as seller_shop_name,
        sp.verified as seller_verified,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        (
          -- Use the PostgreSQL function for optimized search ranking
          product_search_rank(
            unaccent(${searchQuery}),
            unaccent(COALESCE(pt.title, p.title)),
            unaccent(COALESCE(pt.description, p.description))
          ) +
          -- Add business logic bonuses
          CASE 
            WHEN sp.verified THEN 0.3  -- Verified seller bonus
            ELSE 0
          END +
          CASE 
            WHEN p.stock > 10 THEN 0.2    -- High stock bonus
            WHEN p.stock > 0 THEN 0.1     -- In stock bonus  
            ELSE -0.5                     -- Out of stock penalty
          END +
          -- Recency bonus (newer products get slight boost)
          (EXTRACT(EPOCH FROM NOW() - p."createdAt") / 86400.0 / -365.0 * 0.1)
        ) as relevance
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "ProductTranslation" pt ON pt."productId" = p.id AND pt.locale = ${validLocale}
      WHERE p.active = true 
        AND p."eligibilityStatus" = 'APPROVED' 
        AND p."isTest" = false
        ${validCategoryId ? Prisma.sql`AND p."categoryId" = ${validCategoryId}` : Prisma.empty}
        ${validSellerId ? Prisma.sql`AND p."sellerId" = ${validSellerId}` : Prisma.empty}
        ${validMinPrice ? Prisma.sql`AND p."priceToman" >= ${validMinPrice}` : Prisma.empty}
        ${validMaxPrice ? Prisma.sql`AND p."priceToman" <= ${validMaxPrice}` : Prisma.empty}
        ${verifiedOnly ? Prisma.sql`AND sp.verified = true` : Prisma.empty}
        AND (
          SIMILARITY(unaccent(COALESCE(pt.title, p.title)), unaccent(${searchQuery})) > 0.2 OR
          SIMILARITY(unaccent(COALESCE(pt.description, p.description)), unaccent(${searchQuery})) > 0.2 OR
          SIMILARITY(unaccent(sp."shopName"), unaccent(${searchQuery})) > 0.2 OR
          SIMILARITY(unaccent(sp."displayName"), unaccent(${searchQuery})) > 0.2 OR
          to_tsvector('english', unaccent(COALESCE(pt.title, p.title) || ' ' || COALESCE(pt.description, p.description) || ' ' || sp."shopName" || ' ' || sp."displayName")) @@ plainto_tsquery('english', unaccent(${searchQuery})) OR
          unaccent(COALESCE(pt.title, p.title)) ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(COALESCE(pt.description, p.description)) ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(sp."shopName") ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(sp."displayName") ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(COALESCE(pt.title, p.title)) ILIKE unaccent(${searchQuery}) || '%' OR
          LOWER(unaccent(COALESCE(pt.title, p.title))) = LOWER(unaccent(${searchQuery})) OR
          LOWER(unaccent(sp."shopName")) = LOWER(unaccent(${searchQuery})) OR
          LOWER(unaccent(sp."displayName")) = LOWER(unaccent(${searchQuery}))
        )
      ${
        sortBy === 'price_asc'
          ? Prisma.sql`ORDER BY p."priceToman" ASC, relevance DESC`
          : sortBy === 'price_desc'
            ? Prisma.sql`ORDER BY p."priceToman" DESC, relevance DESC`
            : sortBy === 'newest'
              ? Prisma.sql`ORDER BY p."createdAt" DESC, relevance DESC`
              : sortBy === 'oldest'
                ? Prisma.sql`ORDER BY p."createdAt" ASC, relevance DESC`
                : Prisma.sql`ORDER BY relevance DESC, p."createdAt" DESC`
      }
      LIMIT ${validLimit} OFFSET ${offset}
    `;

    const rawProducts = await prisma.$queryRaw<RawSearchResult[]>(searchSql);

    // Count total results with same security measures
    const countSql = Prisma.sql`
      SELECT COUNT(*) as total
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "ProductTranslation" pt ON pt."productId" = p.id AND pt.locale = ${validLocale}
      WHERE p.active = true 
        AND p."eligibilityStatus" = 'APPROVED' 
        AND p."isTest" = false
        ${validCategoryId ? Prisma.sql`AND p."categoryId" = ${validCategoryId}` : Prisma.empty}
        ${validSellerId ? Prisma.sql`AND p."sellerId" = ${validSellerId}` : Prisma.empty}
        ${validMinPrice ? Prisma.sql`AND p."priceToman" >= ${validMinPrice}` : Prisma.empty}
        ${validMaxPrice ? Prisma.sql`AND p."priceToman" <= ${validMaxPrice}` : Prisma.empty}
        ${verifiedOnly ? Prisma.sql`AND sp.verified = true` : Prisma.empty}
        AND (
          SIMILARITY(unaccent(COALESCE(pt.title, p.title)), unaccent(${searchQuery})) > 0.2 OR
          SIMILARITY(unaccent(COALESCE(pt.description, p.description)), unaccent(${searchQuery})) > 0.2 OR
          SIMILARITY(unaccent(sp."shopName"), unaccent(${searchQuery})) > 0.2 OR
          SIMILARITY(unaccent(sp."displayName"), unaccent(${searchQuery})) > 0.2 OR
          to_tsvector('english', unaccent(COALESCE(pt.title, p.title) || ' ' || COALESCE(pt.description, p.description) || ' ' || sp."shopName" || ' ' || sp."displayName")) @@ plainto_tsquery('english', unaccent(${searchQuery})) OR
          unaccent(COALESCE(pt.title, p.title)) ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(COALESCE(pt.description, p.description)) ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(sp."shopName") ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(sp."displayName") ILIKE '%' || unaccent(${searchQuery}) || '%' OR
          unaccent(COALESCE(pt.title, p.title)) ILIKE unaccent(${searchQuery}) || '%' OR
          LOWER(unaccent(COALESCE(pt.title, p.title))) = LOWER(unaccent(${searchQuery})) OR
          LOWER(unaccent(sp."shopName")) = LOWER(unaccent(${searchQuery})) OR
          LOWER(unaccent(sp."displayName")) = LOWER(unaccent(${searchQuery}))
        )
    `;

    const countResult =
      await prisma.$queryRaw<Array<{ total: bigint }>>(countSql);
    total = Number(countResult[0]?.total || 0);

    // Get images for the products from the raw search results
    const productIds = rawProducts.map(row => row.id);
    const images = await prisma.listingImage.findMany({
      where: {
        productId: {
          in: productIds,
        },
      },
      select: {
        productId: true,
        url: true,
        alt: true,
        sortOrder: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    // Create a map of productId -> images for efficient lookup
    // Prefer enhanced image (sortOrder 0) for display
    const imagesByProductId = new Map<
      string,
      Array<{ url: string; alt: string | null }>
    >();

    // Group images by product
    const groupedImages = new Map<string, (typeof images)[0][]>();
    images.forEach(img => {
      if (!groupedImages.has(img.productId)) {
        groupedImages.set(img.productId, []);
      }
      groupedImages.get(img.productId)!.push(img);
    });

    // For each product, sort images and put enhanced (sortOrder 0) first
    groupedImages.forEach((productImages, productId) => {
      const sortedImages = productImages.sort((a, b) => {
        // Enhanced image (sortOrder 0) should be first
        if (a.sortOrder === 0) return -1;
        if (b.sortOrder === 0) return 1;
        return a.sortOrder - b.sortOrder;
      });

      imagesByProductId.set(
        productId,
        sortedImages.map(img => ({
          url: img.url,
          alt: img.alt,
        }))
      );
    });

    // Transform raw results to match expected format
    products = rawProducts.map(row => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      priceToman: row.priceToman,
      stock: row.stock,
      active: row.active,
      eligibilityStatus: row.eligibilityStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      images: imagesByProductId.get(row.id) || [],
      seller: {
        id: row.seller_id,
        handle: row.seller_handle,
        displayName: row.seller_display_name,
        shopName: row.seller_shop_name,
        verified: row.seller_verified,
      },
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name!,
            slug: row.category_slug!,
          }
        : null,
    }));
  } else {
    // Simple search without query - use Prisma query builder for safety
    const where: Prisma.ProductWhereInput = {
      active: true,
      eligibilityStatus: 'APPROVED',
      isTest: false,
      ...(validCategoryId && { categoryId: validCategoryId }),
      ...(validSellerId && { sellerId: validSellerId }),
      ...(validMinPrice && { priceToman: { gte: validMinPrice } }),
      ...(validMaxPrice && { priceToman: { lte: validMaxPrice } }),
      ...(validMinPrice &&
        validMaxPrice && {
          priceToman: {
            gte: validMinPrice,
            lte: validMaxPrice,
          },
        }),
      ...(verifiedOnly && {
        seller: {
          verified: true,
        },
      }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput[] = (() => {
      switch (sortBy) {
        case 'price_asc':
          return [{ priceToman: 'asc' }, { createdAt: 'desc' }];
        case 'price_desc':
          return [{ priceToman: 'desc' }, { createdAt: 'desc' }];
        case 'newest':
          return [{ createdAt: 'desc' }];
        case 'oldest':
          return [{ createdAt: 'asc' }];
        default:
          return [{ createdAt: 'desc' }];
      }
    })();

    const [productsResult, totalResult] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          images: {
            select: {
              url: true,
              alt: true,
              sortOrder: true,
            },
            orderBy: {
              sortOrder: 'asc',
            },
          },
          translations: {
            where: {
              locale: validLocale,
            },
            select: {
              title: true,
              description: true,
            },
          },
          seller: {
            select: {
              id: true,
              handle: true,
              displayName: true,
              shopName: true,
              verified: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy,
        take: validLimit,
        skip: offset,
      }),
      prisma.product.count({ where }),
    ]);

    // Transform products to include translations and properly ordered images
    products = productsResult.map(product => {
      // Get translated title and description if available
      const translation = product.translations[0];
      const translatedTitle = translation?.title || product.title;
      const translatedDescription =
        translation?.description || product.description;

      // Sort images with enhanced image (sortOrder 0) first
      const sortedImages = [...product.images].sort((a, b) => {
        if (a.sortOrder === 0) return -1;
        if (b.sortOrder === 0) return 1;
        return a.sortOrder - b.sortOrder;
      });

      return {
        ...product,
        title: translatedTitle,
        description: translatedDescription,
        images: sortedImages.map(img => ({
          url: img.url,
          alt: img.alt,
        })),
      };
    });
    total = totalResult;

    // Generate facets for simple search
    facets = await generateSearchFacets({
      categoryId: validCategoryId || undefined,
      minPrice: validMinPrice || undefined,
      maxPrice: validMaxPrice || undefined,
      sellerId: validSellerId || undefined,
      verifiedOnly,
    });
  }

  const totalPages = Math.ceil(total / validLimit);

  return {
    products,
    pagination: {
      page: validPage,
      limit: validLimit,
      total,
      totalPages,
      pages: totalPages, // Add for backward compatibility
      hasNext: validPage < totalPages,
      hasPrev: validPage > 1,
    },
    ...(facets && { facets }),
  };
}

/**
 * Secure faceted search implementation using Prisma.sql template literals
 */
async function generateSearchFacets({
  categoryId,
  minPrice,
  maxPrice,
  sellerId,
  verifiedOnly,
}: Pick<
  SearchFilters,
  'categoryId' | 'minPrice' | 'maxPrice' | 'sellerId' | 'verifiedOnly'
>) {
  // Validate inputs
  const cuidPattern = /^[a-z0-9]{25}$/i;
  const validCategoryId =
    categoryId && cuidPattern.test(categoryId) ? categoryId : null;
  const validSellerId =
    sellerId && cuidPattern.test(sellerId) ? sellerId : null;
  const validMinPrice = minPrice && minPrice > 0 ? minPrice : null;
  const validMaxPrice = maxPrice && maxPrice > 0 ? maxPrice : null;

  // 1) Category facets using secure Prisma.sql
  const categoriesSql = Prisma.sql`
    SELECT c.id, c.name, COUNT(*)::int AS count
    FROM "Product" p
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
    WHERE p.active = true 
      AND p."eligibilityStatus" = 'APPROVED' 
      AND p."isTest" = false
      AND p."categoryId" IS NOT NULL
      ${validCategoryId ? Prisma.sql`AND p."categoryId" = ${validCategoryId}` : Prisma.empty}
      ${validSellerId ? Prisma.sql`AND p."sellerId" = ${validSellerId}` : Prisma.empty}
      ${validMinPrice ? Prisma.sql`AND p."priceToman" >= ${validMinPrice}` : Prisma.empty}
      ${validMaxPrice ? Prisma.sql`AND p."priceToman" <= ${validMaxPrice}` : Prisma.empty}
      ${verifiedOnly ? Prisma.sql`AND sp.verified = true` : Prisma.empty}
    GROUP BY c.id, c.name
    ORDER BY count DESC
  `;

  const categoriesPromise =
    prisma.$queryRaw<Array<{ id: string; name: string; count: number }>>(
      categoriesSql
    );

  // 2) Price ranges using secure Prisma.sql
  const priceRangesSql = Prisma.sql`
    WITH bounds AS (
      SELECT MIN(p."priceToman")::float AS min_price, MAX(p."priceToman")::float AS max_price
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      WHERE p.active = true 
        AND p."eligibilityStatus" = 'APPROVED' 
        AND p."isTest" = false
        ${validCategoryId ? Prisma.sql`AND p."categoryId" = ${validCategoryId}` : Prisma.empty}
        ${validSellerId ? Prisma.sql`AND p."sellerId" = ${validSellerId}` : Prisma.empty}
        ${validMinPrice ? Prisma.sql`AND p."priceToman" >= ${validMinPrice}` : Prisma.empty}
        ${validMaxPrice ? Prisma.sql`AND p."priceToman" <= ${validMaxPrice}` : Prisma.empty}
        ${verifiedOnly ? Prisma.sql`AND sp.verified = true` : Prisma.empty}
    ),
    buckets AS (
      SELECT
        CASE 
          WHEN (SELECT max_price FROM bounds) IS NULL OR (SELECT min_price FROM bounds) IS NULL OR (SELECT max_price FROM bounds) = (SELECT min_price FROM bounds)
            THEN NULL
          ELSE width_bucket(p."priceToman", (SELECT min_price FROM bounds), (SELECT max_price FROM bounds), 5)
        END AS bucket
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      WHERE p.active = true 
        AND p."eligibilityStatus" = 'APPROVED' 
        AND p."isTest" = false
        ${validCategoryId ? Prisma.sql`AND p."categoryId" = ${validCategoryId}` : Prisma.empty}
        ${validSellerId ? Prisma.sql`AND p."sellerId" = ${validSellerId}` : Prisma.empty}
        ${validMinPrice ? Prisma.sql`AND p."priceToman" >= ${validMinPrice}` : Prisma.empty}
        ${validMaxPrice ? Prisma.sql`AND p."priceToman" <= ${validMaxPrice}` : Prisma.empty}
        ${verifiedOnly ? Prisma.sql`AND sp.verified = true` : Prisma.empty}
    )
    SELECT 
      b.bucket,
      COUNT(*)::int AS count,
      (SELECT min_price FROM bounds) + ((b.bucket - 1) * ((SELECT max_price FROM bounds) - (SELECT min_price FROM bounds)) / 5.0) AS min,
      CASE WHEN b.bucket = 5 THEN (SELECT max_price FROM bounds)
           ELSE (SELECT min_price FROM bounds) + (b.bucket * ((SELECT max_price FROM bounds) - (SELECT min_price FROM bounds)) / 5.0)
      END AS max
    FROM buckets b
    WHERE b.bucket IS NOT NULL
    GROUP BY b.bucket
    ORDER BY b.bucket
  `;

  const priceRangesPromise =
    prisma.$queryRaw<
      Array<{ bucket: number; count: number; min: number; max: number }>
    >(priceRangesSql);

  // 3) Verified sellers count using secure Prisma.sql
  const verifiedSellersSql = Prisma.sql`
    SELECT COUNT(*) AS count
    FROM "Product" p
    LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
    WHERE p.active = true 
      AND p."eligibilityStatus" = 'APPROVED' 
      AND p."isTest" = false
      AND sp.verified = true
      ${validCategoryId ? Prisma.sql`AND p."categoryId" = ${validCategoryId}` : Prisma.empty}
      ${validSellerId ? Prisma.sql`AND p."sellerId" = ${validSellerId}` : Prisma.empty}
      ${validMinPrice ? Prisma.sql`AND p."priceToman" >= ${validMinPrice}` : Prisma.empty}
      ${validMaxPrice ? Prisma.sql`AND p."priceToman" <= ${validMaxPrice}` : Prisma.empty}
  `;

  const verifiedSellersPromise =
    prisma.$queryRaw<Array<{ count: bigint }>>(verifiedSellersSql);

  const [categories, priceBuckets, verifiedSellersRaw] = await Promise.all([
    categoriesPromise,
    priceRangesPromise,
    verifiedSellersPromise,
  ]);

  const priceRanges = priceBuckets.map(b => ({
    min: Math.floor(b.min),
    max: Math.ceil(b.max),
    count: b.count,
  }));

  const verifiedSellers = Number(verifiedSellersRaw[0]?.count || 0);

  return {
    categories,
    priceRanges,
    verifiedSellers,
  };
}
