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

export async function searchProducts(filters: SearchFilters = {}): Promise<SearchResult> {
  const {
    query,
    categoryId,
    minPrice,
    maxPrice,
    sellerId,
    verifiedOnly,
    sortBy = 'relevance',
    page = 1,
    limit = 20
  } = filters;

  const offset = (page - 1) * limit;

  // Base WHERE conditions
  const baseConditions: Prisma.ProductWhereInput = {
    active: true,
    eligibilityStatus: 'APPROVED',
    ...(categoryId && { categoryId }),
    ...(sellerId && { sellerId }),
    ...(minPrice && { priceToman: { gte: minPrice } }),
    ...(maxPrice && { priceToman: { lte: maxPrice } }),
    ...(minPrice && maxPrice && { 
      priceToman: { 
        gte: minPrice, 
        lte: maxPrice 
      } 
    }),
    ...(verifiedOnly && {
      seller: {
        verified: true
      }
    })
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
    const limitParam = `$${paramIndex + 1}`;
    const offsetParam = `$${paramIndex + 2}`;
    
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
          -- Enhanced relevance scoring with multiple factors
          (SIMILARITY(p.title, ${searchQueryParam}) * 4) +          -- Title similarity (4x weight)
          (SIMILARITY(p.description, ${searchQueryParam}) * 1.5) +  -- Description similarity (1.5x weight)
          (ts_rank_cd(to_tsvector('english', p.title || ' ' || p.description), plainto_tsquery('english', ${searchQueryParam})) * 3) + -- Enhanced FTS rank (3x weight)
          CASE 
            WHEN LOWER(p.title) = LOWER(${searchQueryParam}) THEN 2.0    -- Exact title match (huge bonus)
            WHEN p.title ILIKE ${searchQueryParam} || '%' THEN 1.5        -- Title starts with query
            WHEN p.title ILIKE '%' || ${searchQueryParam} || '%' THEN 0.8  -- Title contains query
            ELSE 0
          END +
          CASE 
            WHEN LOWER(p.description) ILIKE '%' || LOWER(${searchQueryParam}) || '%' THEN 0.3  -- Description contains query
            ELSE 0
          END +
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
      ${whereClause}
      AND (
        SIMILARITY(p.title, ${searchQueryParam}) > 0.08 OR       -- Lower trigram threshold for better recall
        SIMILARITY(p.description, ${searchQueryParam}) > 0.08 OR
        to_tsvector('english', p.title || ' ' || p.description) @@ plainto_tsquery('english', ${searchQueryParam}) OR -- FTS match
        p.title ILIKE '%' || ${searchQueryParam} || '%' OR       -- Partial title match
        p.description ILIKE '%' || ${searchQueryParam} || '%' OR -- Partial description match
        p.title ILIKE ${searchQueryParam} || '%' OR              -- Title starts with query
        LOWER(p.title) = LOWER(${searchQueryParam})              -- Exact title match
      )
      ${orderBy}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    params.push(searchQuery, limit, offset);

    const rawProducts = await prisma.$queryRawUnsafe(searchSql, ...params);

    // Count total results
    const countSql = `
      SELECT COUNT(*) as total
      FROM "Product" p
      LEFT JOIN "SellerProfile" sp ON p."sellerId" = sp.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      ${whereClause}
      AND (
        SIMILARITY(p.title, ${searchQueryParam}) > 0.08 OR
        SIMILARITY(p.description, ${searchQueryParam}) > 0.08 OR
        to_tsvector('english', p.title || ' ' || p.description) @@ plainto_tsquery('english', ${searchQueryParam}) OR
        p.title ILIKE '%' || ${searchQueryParam} || '%' OR
        p.description ILIKE '%' || ${searchQueryParam} || '%' OR
        p.title ILIKE ${searchQueryParam} || '%' OR
        LOWER(p.title) = LOWER(${searchQueryParam})
      )
    `;

    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await prisma.$queryRawUnsafe(countSql, ...countParams) as Array<{ total: bigint }>;
    total = Number(countResult[0]?.total || 0);

    // Transform raw results to match expected format
    products = (rawProducts as RawSearchResult[]).map((row: RawSearchResult) => ({
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
      category: row.category_id ? {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
      } : null,
      images: [], // Will be populated separately
    }));

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
            }
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            }
          },
          images: {
            select: {
              url: true,
              alt: true,
              sortOrder: true,
            },
            orderBy: {
              sortOrder: 'asc'
            }
          }
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.product.count({ where: baseConditions })
    ]);

    products = productsResult;
    total = totalResult;
  }

  // Populate images for search results if not already included
  if (query && products.length > 0) {
    const productIds = products.map((p) => p.id);
    const images = await prisma.listingImage.findMany({
      where: {
        productId: { in: productIds }
      },
      select: {
        productId: true,
        url: true,
        alt: true,
        sortOrder: true,
      },
      orderBy: {
        sortOrder: 'asc'
      }
    });

    // Group images by product ID
    const imagesByProduct = images.reduce((acc, img) => {
      if (!acc[img.productId]) acc[img.productId] = [];
      acc[img.productId].push({
        url: img.url,
        alt: img.alt,
        sortOrder: img.sortOrder,
      });
      return acc;
    }, {} as Record<string, Array<{ url: string; alt: string | null; sortOrder: number }>>);

    // Assign images to products
    products.forEach((product) => {
      (product as { id: string; images: Array<{ url: string; alt: string | null; sortOrder: number }> }).images = imagesByProduct[product.id] || [];
    });
  }

  // Generate facets for filtering UI
  const facets = await generateSearchFacets(baseConditions);

  return {
    products: products as SearchResult['products'],
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    facets
  };
}

async function generateSearchFacets(baseConditions: Prisma.ProductWhereInput) {
  // Get category facets
  const categoryFacets = await prisma.product.groupBy({
    by: ['categoryId'],
    where: baseConditions,
    _count: {
      id: true
    }
  });

  const categoryDetails = await prisma.category.findMany({
    where: {
      id: { in: categoryFacets.map(f => f.categoryId).filter(Boolean) as string[] }
    },
    select: { id: true, name: true }
  });

  const categories = categoryFacets
    .filter(f => f.categoryId)
    .map(f => ({
      id: f.categoryId!,
      name: categoryDetails.find(c => c.id === f.categoryId)?.name || 'Unknown',
      count: f._count.id
    }));

  // Get price range distribution
  const priceStats = await prisma.product.aggregate({
    where: baseConditions,
    _min: { priceToman: true },
    _max: { priceToman: true }
  });

  const minPrice = priceStats._min.priceToman || 0;
  const maxPrice = priceStats._max.priceToman || 1000000;
  const priceStep = Math.ceil((maxPrice - minPrice) / 5); // 5 price ranges

  const priceRanges = [];
  for (let i = 0; i < 5; i++) {
    const rangeMin = minPrice + (i * priceStep);
    const rangeMax = i === 4 ? maxPrice : minPrice + ((i + 1) * priceStep);
    
    const count = await prisma.product.count({
      where: {
        ...baseConditions,
        priceToman: {
          gte: rangeMin,
          lte: rangeMax
        }
      }
    });

    if (count > 0) {
      priceRanges.push({
        min: rangeMin,
        max: rangeMax,
        count
      });
    }
  }

  // Count verified sellers
  const verifiedSellers = await prisma.product.count({
    where: {
      ...baseConditions,
      seller: {
        verified: true
      }
    }
  });

  return {
    categories,
    priceRanges,
    verifiedSellers
  };
}