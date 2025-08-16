import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { ProductCard } from '@/components/products/ProductCard';
import { ExploreFilters } from '@/components/explore/ExploreFilters';
import { ExplorePagination } from '@/components/explore/ExplorePagination';
import { PaginatedProducts, PrismaWhereClause, PrismaOrderBy } from '@/types/database';

export const revalidate = 300; // 5 minutes for explore page

interface PageProps {
  params: {
    locale: string;
  };
  searchParams: {
    search?: string;
    category?: string;
    sort?: string;
    page?: string;
  };
}

const PRODUCTS_PER_PAGE = 12;

async function getProducts(locale: string, searchParams: PageProps['searchParams']): Promise<PaginatedProducts> {
  try {
    const search = searchParams.search;
    const category = searchParams.category;
    const sort = searchParams.sort || 'newest';
    const page = parseInt(searchParams.page || '1');
    const skip = (page - 1) * PRODUCTS_PER_PAGE;

    const where: PrismaWhereClause = {
      active: true,
    };

    // Add search filter
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Add category filter
    if (category && category !== 'all') {
      where.category = {
        slug: category
      };
    }

    // Determine sort order
    let orderBy: PrismaOrderBy = { createdAt: 'desc' }; // newest (default)
    switch (sort) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'price_low':
        orderBy = { priceToman: 'asc' };
        break;
      case 'price_high':
        orderBy = { priceToman: 'desc' };
        break;
      case 'popular':
        orderBy = { createdAt: 'desc' }; // fallback since no views field
        break;
    }

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          seller: true,
          category: true,
          images: true,
          // @ts-expect-error: field exists after migration
          translations: true
        },
        orderBy,
        take: PRODUCTS_PER_PAGE,
        skip
      }),
      prisma.product.count({ where })
    ]);

  type WithTranslations = typeof products[number] & {
    translations?: Array<{ locale: string; title: string; description: string }>;
    eligibilityStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEW';
  };
  let localized = (products as WithTranslations[]).map((p) => {
    if (locale === 'en' && Array.isArray(p.translations)) {
      const en = p.translations.find((t) => t.locale === 'en');
      if (en) return { ...p, title: en.title, description: en.description } as typeof p;
    }
    return p;
  });
  // Soft-filter non-handcrafted items if eligibility flag exists
  localized = localized.filter((p) => !p.eligibilityStatus || p.eligibilityStatus !== 'REJECTED');

    return {
      products: localized as unknown as PaginatedProducts['products'],
      totalCount,
      totalPages: Math.ceil(totalCount / PRODUCTS_PER_PAGE),
      currentPage: page
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    // Localized fallback products when database is unavailable
    const tHome = await getTranslations({ locale, namespace: 'home' });
    const tCategories = await getTranslations({ locale, namespace: 'categories' });

    const sampleProducts = [
      {
        id: "1",
        title: tHome('sampleProducts.ceramicBowl.title'),
        slug: "handmade-ceramic-bowl",
        description: tHome('sampleProducts.ceramicBowl.description'),
        priceToman: 450000,
        stock: 12,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        sellerId: "sample",
        categoryId: "ceramics",
        images: [{
          id: "1",
          productId: "1",
          url: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop",
          alt: tHome('sampleProducts.ceramicBowl.title'),
          sortOrder: 1
        }],
        seller: {
          id: "sample",
          userId: "sample",
          shopName: "Atelier Kiara",
          displayName: tHome('sampleProducts.shopName'),
          bio: null,
          region: null,
          avatarUrl: null,
          createdAt: new Date()
        },
        category: {
          id: "ceramics",
          slug: "ceramics",
          name: tCategories('ceramics')
        }
      },
      {
        id: "2",
        title: tHome('sampleProducts.silverNecklace.title'),
        slug: "silver-turquoise-necklace",
        description: tHome('sampleProducts.silverNecklace.description'),
        priceToman: 1250000,
        stock: 8,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        sellerId: "sample",
        categoryId: "jewelry",
        images: [{
          id: "2",
          productId: "2",
          url: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop",
          alt: tHome('sampleProducts.silverNecklace.title'),
          sortOrder: 1
        }],
        seller: {
          id: "sample",
          userId: "sample",
          shopName: "Atelier Kiara",
          displayName: tHome('sampleProducts.shopName'),
          bio: null,
          region: null,
          avatarUrl: null,
          createdAt: new Date()
        },
        category: {
          id: "jewelry",
          slug: "jewelry",
          name: tCategories('jewelry')
        }
      }
    ];
    
    return {
      products: sampleProducts,
      totalCount: sampleProducts.length,
      totalPages: 1,
      currentPage: 1
    };
  }
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const t = await getTranslations({ locale: params.locale, namespace: 'explore' });
  
  let title = t('title');
  let description = t('subtitle');
  
  if (searchParams.search) {
    title = `${searchParams.search} - ${title}`;
    description = `Search results for "${searchParams.search}" - ${description}`;
  }
  
  if (searchParams.category && searchParams.category !== 'all') {
    const categoryName = searchParams.category;
    title = `${categoryName} - ${title}`;
    description = `Explore ${categoryName} products - ${description}`;
  }

  const canonicalUrl = `https://www.kiarakraft.com/${params.locale}/explore`;
  const alternateUrls = {
    'fa-IR': `https://www.kiarakraft.com/fa/explore`,
    'en-US': `https://www.kiarakraft.com/en/explore`
  };

  return {
    metadataBase: new URL('https://www.kiarakraft.com'),
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: alternateUrls
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      locale: params.locale === 'fa' ? 'fa_IR' : 'en_US',
      alternateLocale: params.locale === 'fa' ? 'en_US' : 'fa_IR'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description
    }
  };
}

export default async function ExplorePage({ params, searchParams }: PageProps) {
  const t = await getTranslations({ locale: params.locale, namespace: 'explore' });
  const tCategories = await getTranslations({ locale: params.locale, namespace: 'categories' });
  const { products, totalCount, totalPages, currentPage } = await getProducts(params.locale, searchParams);

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            {t('title')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        {/* Search and Filters */}
        <Suspense fallback={<div className="h-32 animate-pulse bg-gray-100 rounded-lg mb-8" />}>
          <ExploreFilters 
            initialSearch={searchParams.search || ''}
            initialCategory={searchParams.category || 'all'}
            initialSort={searchParams.sort || 'newest'}
            locale={params.locale}
            precomputed={{
              searchPlaceholder: t('searchPlaceholder'),
              clearFilters: t('clearFilters'),
              selectCategory: t('filters.selectCategory'),
              categories: [
                { value: 'all', label: t('filters.allCategories') },
                { value: 'ceramics', label: tCategories('ceramics') },
                { value: 'textiles', label: tCategories('textiles') },
                { value: 'jewelry', label: tCategories('jewelry') },
                { value: 'woodwork', label: tCategories('woodwork') },
                { value: 'painting', label: tCategories('painting') }
              ],
              sortOptions: [
                { value: 'newest', label: t('filters.newest') },
                { value: 'oldest', label: t('filters.oldest') },
                { value: 'price_low', label: t('filters.priceLowToHigh') },
                { value: 'price_high', label: t('filters.priceHighToLow') },
                { value: 'popular', label: t('filters.popular') }
              ]
            }}
          />
        </Suspense>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            {t('resultsCount', { count: totalCount })}
          </p>
        </div>

        {/* Products Grid */}
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {products.map((product) => (
                <ProductCard 
                  key={product.id} 
                  product={{
                    ...product,
                    images: product.images.map(img => ({
                      url: img.url,
                      alt: img.alt || product.title
                    })),
                    seller: {
                      displayName: product.seller.displayName,
                      shopName: product.seller.shopName
                    }
                  }} 
                />
              ))}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <ExplorePagination
                currentPage={currentPage}
                totalPages={totalPages}
                searchParams={searchParams}
                locale={params.locale}
              />
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <div className="h-12 w-12 mx-auto mb-4 opacity-50 bg-gray-200 rounded-full"></div>
              <p className="text-lg">{t('noResults')}</p>
              <p className="text-sm">{t('noResultsDescription')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}