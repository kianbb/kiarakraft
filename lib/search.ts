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
      sortOrder: number;
    }>;
    seller: {
      id: string;
      displayName: string;
      shopName: string;
      verified: boolean;
    };
    category: {
      id: string;
      name: string;
      slug: string;
    } | null;
    _relevance?: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  facets: {
    categories: Array<{ id: string; name: string; count: number }>;
    priceRanges: Array<{ min: number; max: number; count: number }>;
    verifiedSellers: number;
  };
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

  const offset = (page - 1) * limit;

  // Base WHERE conditions
  const baseConditions: Prisma.ProductWhereInput = {
    active: true,
    eligibilityStatus: 'APPROVED',
    // Exclude known test/demo items
    NOT: [
      { slug: { startsWith: 'test-' } },
      { seller: { shopName: 'Test Shop' } },
      { seller: { displayName: 'Test Seller' } },
      { seller: { displayName: 'Search Test Seller' } },
      // Additional variant observed in production UI (seller test account)
      { seller: { displayName: 'Test Search Seller' } },
      // Broad catch-all: exclude any seller display name containing 'test'
      { seller: { displayName: { contains: 'test', mode: 'insensitive' } } },
    ],
    ...(categoryId && { categoryId }),
    ...(sellerId && { sellerId }),
    ...(minPrice && { priceToman: { gte: minPrice } }),
    ...(maxPrice && { priceToman: { lte: maxPrice } }),
    ...(minPrice &&
      maxPrice && {
        priceToman: {
          gte: minPrice,
          lte: maxPrice,
        },
      }),
    ...(verifiedOnly && {
      seller: {
        verified: true,
      },
    }),
  };

  let products;
  let total;

  if (query && query.trim().length > 0) {
    // Use advanced search with trigram similarity and full-text search
    const searchQuery = query.trim();

    // Build WHERE clause for raw query
    const whereConditions = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Add base conditions
    whereConditions.push(`p.active = true`);
    whereConditions.push(`p."eligibilityStatus" = 'APPROVED'`);
    // Exclude known test/demo items
    whereConditions.push(`p."slug" NOT LIKE 'test-%'`);
    whereConditions.push(`COALESCE(sp."shopName", '') <> 'Test Shop'`);
    whereConditions.push(`COALESCE(sp."displayName", '') <> 'Test Seller'`);
    whereConditions.push(
      `COALESCE(sp."displayName", '') <> 'Search Test Seller'`
    );
    // Additional variant observed in production UI (seller test account)
    whereConditions.push(
      `COALESCE(sp."displayName", '') <> 'Test Search Seller'`
    );
    // Broad exclusion: any seller display name containing 'test'
    whereConditions.push(
      `LOWER(COALESCE(sp."displayName", '')) NOT LIKE '%test%'`
    );

    if (categoryId) {
      whereConditions.push(`p."categoryId" = $${paramIndex}`);
      params.push(categoryId);
      paramIndex++;
    }

    if (sellerId) {
      whereConditions.push(`p."sellerId" = $${paramIndex}`);
      params.push(sellerId);
      paramIndex++;
    }

    if (minPrice) {
      whereConditions.push(`p."priceToman" >= $${paramIndex}`);
      params.push(minPrice);
      paramIndex++;
    }

    if (maxPrice) {
      whereConditions.push(`p."priceToman" <= $${paramIndex}`);
      params.push(maxPrice);
      paramIndex++;
    }

    if (verifiedOnly) {
      whereConditions.push(`sp.verified = true`);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    // Determine sort order
    let orderBy = '';
    switch (sortBy) {
      case 'price_asc':
        orderBy = 'ORDER BY p."priceToman" ASC, relevance DESC';
        break;
      case 'price_desc':
        orderBy = 'ORDER BY p."priceToman" DESC, relevance DESC';
        break;
      case 'newest':
        orderBy = 'ORDER BY p."createdAt" DESC, relevance DESC';
        break;
      case 'oldest':
        orderBy = 'ORDER BY p."createdAt" ASC, relevance DESC';
        break;
      default:
        orderBy = 'ORDER BY relevance DESC, p."createdAt" DESC';
    }

    // Build the search query with proper parameter placeholders
    const searchQueryParam = `$${paramIndex}`;
    // Also bind locale for joining translations (so English searches match translated titles)
    const localeParam = `$${paramIndex + 1}`;
    const limitParam = `$${paramIndex + 2}`;
    const offsetParam = `$${paramIndex + 3}`;

    // Advanced search query with multiple ranking factors
    const searchSql = `
      SELECT 
        p.*,
        sp.id as seller_id,
        sp."displayName" as seller_display_name,
        sp."shopName" as seller_shop_name,
        sp.verified as seller_verified,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        (
          -- Use the new PostgreSQL function for optimized search ranking
      product_search_rank(
            unaccent(${searchQueryParam}),
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
          (EXTRACT(EPOCH FROM NOW() - p."createdAt") / 86400.0 / -365.0 * 0.1) -- Days since creation as negative years * 0.1
        ) as relevance
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "ProductTranslation" pt ON pt."productId" = p.id AND pt.locale = ${localeParam}
      ${whereClause}
      AND (
        SIMILARITY(unaccent(COALESCE(pt.title, p.title)), unaccent(${searchQueryParam})) > 0.2 OR
        SIMILARITY(unaccent(COALESCE(pt.description, p.description)), unaccent(${searchQueryParam})) > 0.2 OR
        to_tsvector('english', unaccent(COALESCE(pt.title, p.title) || ' ' || COALESCE(pt.description, p.description))) @@ plainto_tsquery('english', unaccent(${searchQueryParam})) OR -- FTS match
        unaccent(COALESCE(pt.title, p.title)) ILIKE '%' || unaccent(${searchQueryParam}) || '%' OR
        unaccent(COALESCE(pt.description, p.description)) ILIKE '%' || unaccent(${searchQueryParam}) || '%' OR
        unaccent(COALESCE(pt.title, p.title)) ILIKE unaccent(${searchQueryParam}) || '%' OR
        LOWER(unaccent(COALESCE(pt.title, p.title))) = LOWER(unaccent(${searchQueryParam}))
      )
      ${orderBy}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    params.push(searchQuery, locale, limit, offset);

    const rawProducts = await prisma.$queryRawUnsafe(searchSql, ...params);

    // Count total results
    const countSql = `
      SELECT COUNT(*) as total
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "ProductTranslation" pt ON pt."productId" = p.id AND pt.locale = ${localeParam}
      ${whereClause}
      AND (
    SIMILARITY(unaccent(COALESCE(pt.title, p.title)), unaccent(${searchQueryParam})) > 0.2 OR
    SIMILARITY(unaccent(COALESCE(pt.description, p.description)), unaccent(${searchQueryParam})) > 0.2 OR
    to_tsvector('english', unaccent(COALESCE(pt.title, p.title) || ' ' || COALESCE(pt.description, p.description))) @@ plainto_tsquery('english', unaccent(${searchQueryParam})) OR
    unaccent(COALESCE(pt.title, p.title)) ILIKE '%' || unaccent(${searchQueryParam}) || '%' OR
    unaccent(COALESCE(pt.description, p.description)) ILIKE '%' || unaccent(${searchQueryParam}) || '%' OR
    unaccent(COALESCE(pt.title, p.title)) ILIKE unaccent(${searchQueryParam}) || '%' OR
    LOWER(unaccent(COALESCE(pt.title, p.title))) = LOWER(unaccent(${searchQueryParam}))
      )
    `;

    const countParams = params.slice(0, -2); // Remove limit and offset (keeping search and locale)
    const countResult = (await prisma.$queryRawUnsafe(
      countSql,
      ...countParams
    )) as Array<{ total: bigint }>;
    total = Number(countResult[0]?.total || 0);

    // Transform raw results to match expected format
    products = (rawProducts as RawSearchResult[]).map(
      (row: RawSearchResult) => ({
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
        _relevance: Number(row.relevance),
        seller: {
          id: row.seller_id,
          displayName: row.seller_display_name,
          shopName: row.seller_shop_name,
          verified: row.seller_verified,
        },
        category: row.category_id
          ? {
              id: row.category_id,
              name: row.category_name,
              slug: row.category_slug,
            }
          : null,
        images: [], // Will be populated separately
      })
    );

    // Apply translations for search results if needed
    if (locale === 'en' && products.length > 0) {
      const productIds = products.map(p => p.id);
      const translations = await prisma.productTranslation.findMany({
        where: {
          productId: { in: productIds },
          locale: 'en',
        },
      });

      const translationMap = new Map(
        translations.map(t => [
          t.productId,
          { title: t.title, description: t.description },
        ])
      );

      products = products.map(product => {
        const translation = translationMap.get(product.id);
        if (translation) {
          return {
            ...product,
            title: translation.title,
            description: translation.description,
          };
        }
        return product;
      });
    }
  } else {
    // Simple filtering without search query
    let orderBy: Prisma.ProductOrderByWithRelationInput[] = [];

    switch (sortBy) {
      case 'price_asc':
        orderBy = [{ priceToman: 'asc' }];
        break;
      case 'price_desc':
        orderBy = [{ priceToman: 'desc' }];
        break;
      case 'newest':
        orderBy = [{ createdAt: 'desc' }];
        break;
      case 'oldest':
        orderBy = [{ createdAt: 'asc' }];
        break;
      default:
        orderBy = [{ createdAt: 'desc' }];
    }

    const [productsResult, totalResult] = await Promise.all([
      prisma.product.findMany({
        where: baseConditions,
        include: {
          seller: {
            select: {
              id: true,
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
            where: { locale },
          },
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.product.count({ where: baseConditions }),
    ]);

    // Apply translations if available
    products = productsResult.map(product => {
      if (locale === 'en' && product.translations.length > 0) {
        const translation = product.translations[0];
        return {
          ...product,
          title: translation.title,
          description: translation.description,
        };
      }
      return product;
    });
    total = totalResult;
  }

  // Populate images for search results if not already included
  if (query && products.length > 0) {
    const productIds = products.map(p => p.id);
    const images = await prisma.listingImage.findMany({
      where: {
        productId: { in: productIds },
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

    // Group images by product ID
    const imagesByProduct = images.reduce(
      (acc, img) => {
        if (!acc[img.productId]) acc[img.productId] = [];
        acc[img.productId].push({
          url: img.url,
          alt: img.alt,
          sortOrder: img.sortOrder,
        });
        return acc;
      },
      {} as Record<
        string,
        Array<{ url: string; alt: string | null; sortOrder: number }>
      >
    );

    // Assign images to products
    products.forEach(product => {
      (
        product as {
          id: string;
          images: Array<{ url: string; alt: string | null; sortOrder: number }>;
        }
      ).images = imagesByProduct[product.id] || [];
    });
  }

  // Generate facets for filtering UI (optimized, fewer queries)
  const facets = await generateSearchFacets({
    categoryId,
    minPrice,
    maxPrice,
    sellerId,
    verifiedOnly,
  });

  return {
    products: products as SearchResult['products'],
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    facets,
  };
}

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
  // Build WHERE clause and params once for reuse across facet queries
  const whereParts: string[] = [
    'p.active = true',
    `p."eligibilityStatus" = 'APPROVED'`,
    // Exclude known test/demo items
    `p."slug" NOT LIKE 'test-%'`,
    `COALESCE(sp."shopName", '') <> 'Test Shop'`,
    `COALESCE(sp."displayName", '') <> 'Test Seller'`,
    `COALESCE(sp."displayName", '') <> 'Search Test Seller'`,
    `COALESCE(sp."displayName", '') <> 'Test Search Seller'`,
    `LOWER(COALESCE(sp."displayName", '')) NOT LIKE '%test%'`,
  ];
  const params: (string | number | boolean)[] = [];
  let idx = 1;

  if (categoryId) {
    whereParts.push(`p."categoryId" = $${idx++}`);
    params.push(categoryId);
  }
  if (sellerId) {
    whereParts.push(`p."sellerId" = $${idx++}`);
    params.push(sellerId);
  }
  if (typeof minPrice === 'number') {
    whereParts.push(`p."priceToman" >= $${idx++}`);
    params.push(minPrice);
  }
  if (typeof maxPrice === 'number') {
    whereParts.push(`p."priceToman" <= $${idx++}`);
    params.push(maxPrice);
  }
  if (verifiedOnly) {
    whereParts.push(`sp.verified = true`);
  }

  const whereClause = whereParts.length
    ? `WHERE ${whereParts.join(' AND ')}`
    : '';

  // 1) Category facets in a single query
  const categoriesPromise = prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; count: number }>
  >(
    `
    SELECT c.id, c.name, COUNT(*)::int AS count
    FROM "Product" p
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
    ${whereClause}
    AND p."categoryId" IS NOT NULL
    GROUP BY c.id, c.name
    ORDER BY count DESC
    `,
    ...params
  );

  // 2) Price ranges using width_bucket in a single query (up to 5 buckets)
  const priceRangesPromise = prisma.$queryRawUnsafe<
    Array<{ bucket: number; count: number; min: number; max: number }>
  >(
    `
    WITH bounds AS (
      SELECT MIN(p."priceToman")::float AS min_price, MAX(p."priceToman")::float AS max_price
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      ${whereClause}
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
      ${whereClause}
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
    `,
    ...params
  );

  // 3) Verified sellers count
  const verifiedSellersPromise = prisma.$queryRawUnsafe<
    Array<{ count: bigint }>
  >(
    `
    SELECT COUNT(*) AS count
    FROM "Product" p
    LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
    ${whereClause}
    AND sp.verified = true
    `,
    ...params
  );

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
