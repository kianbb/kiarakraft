import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { searchProducts, SearchFilters } from '@/lib/search';
import { prisma } from '@/lib/prisma';
import { ProductCard } from '@/components/products/ProductCard';
import { ExploreFilters } from '@/components/explore/ExploreFilters';
import { ExplorePagination } from '@/components/explore/ExplorePagination';
import { SearchStats } from '@/components/explore/SearchStats';

// Disable caching temporarily to test search functionality
export const revalidate = 0;

interface PageProps {
  params: {
    locale: string;
  };
  searchParams: {
    q?: string;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    verified?: string;
    sort?: string;
    page?: string;
  };
}

const PRODUCTS_PER_PAGE = 12;

async function getSearchResults(
  locale: string,
  searchParams: PageProps['searchParams']
) {
  try {
    // Translate category slug (from URL) to the actual Category ID used in DB
    let categoryIdFromSlug: string | undefined;
    if (searchParams.category && searchParams.category !== 'all') {
      const cat = await prisma.category.findUnique({
        where: { slug: searchParams.category },
      });
      categoryIdFromSlug = cat?.id;
    }
    const filters: SearchFilters = {
      query: searchParams.q?.trim(),
      categoryId: categoryIdFromSlug,
      minPrice: searchParams.minPrice
        ? parseInt(searchParams.minPrice)
        : undefined,
      maxPrice: searchParams.maxPrice
        ? parseInt(searchParams.maxPrice)
        : undefined,
      verifiedOnly: searchParams.verified === 'true',
      sortBy: (searchParams.sort || 'relevance') as SearchFilters['sortBy'],
      page: parseInt(searchParams.page || '1'),
      limit: PRODUCTS_PER_PAGE,
    };

    const results = await searchProducts({ ...filters, locale });

    // Transform results to include seller verification status
    const transformedProducts = results.products.map(product => ({
      ...product,
      seller: {
        ...product.seller,
        verified: product.seller.verified,
      },
    }));

    return {
      ...results,
      products: transformedProducts,
    };
  } catch (error) {
    console.error('Error in search:', error);

    // Fallback to empty results
    return {
      products: [],
      pagination: {
        page: 1,
        limit: PRODUCTS_PER_PAGE,
        total: 0,
        pages: 0,
      },
      facets: {
        categories: [],
        priceRanges: [],
        verifiedSellers: 0,
      },
    };
  }
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: 'explore',
  });

  let title = t('title');
  let description = t('subtitle');

  if (searchParams.q) {
    title = `${searchParams.q} - ${title}`;
    description = `Search results for "${searchParams.q}" - ${description}`;
  }

  if (searchParams.category && searchParams.category !== 'all') {
    const categoryName = searchParams.category;
    title = `${categoryName} - ${title}`;
    description = `Explore ${categoryName} products - ${description}`;
  }

  const canonicalUrl = `https://www.kiarakraft.com/${params.locale}/explore`;
  const alternateUrls = {
    'fa-IR': `https://www.kiarakraft.com/fa/explore`,
    'en-US': `https://www.kiarakraft.com/en/explore`,
  };

  return {
    metadataBase: new URL('https://www.kiarakraft.com'),
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: alternateUrls,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      locale: params.locale === 'fa' ? 'fa_IR' : 'en_US',
      alternateLocale: params.locale === 'fa' ? 'en_US' : 'fa_IR',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ExplorePage({ params, searchParams }: PageProps) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: 'explore',
  });
  const tCategories = await getTranslations({
    locale: params.locale,
    namespace: 'categories',
  });

  const { products, pagination, facets } = await getSearchResults(
    params.locale,
    searchParams
  );
  const hasQuery = Boolean(searchParams.q?.trim());
  const hasFilters = Boolean(
    (searchParams.category && searchParams.category !== 'all') ||
      searchParams.minPrice ||
      searchParams.maxPrice ||
      searchParams.verified === 'true'
  );

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            {hasQuery ? t('searchResults') : t('title')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {hasQuery
              ? t('searchResultsFor', { query: searchParams.q || '' })
              : t('subtitle')}
          </p>
        </div>

        {/* Enhanced Search and Filters */}
        <Suspense
          fallback={
            <div className="h-32 animate-pulse bg-gray-100 rounded-lg mb-8" />
          }
        >
          <ExploreFilters
            initialSearch={searchParams.q || ''}
            initialCategory={searchParams.category || 'all'}
            initialSort={
              searchParams.sort || (hasQuery ? 'relevance' : 'newest')
            }
            initialMinPrice={searchParams.minPrice}
            initialMaxPrice={searchParams.maxPrice}
            initialVerified={searchParams.verified === 'true'}
            locale={params.locale}
            facets={facets}
            precomputed={{
              searchPlaceholder: t('searchPlaceholder'),
              clearFilters: t('clearFilters'),
              selectCategory: t('filters.selectCategory'),
              priceRange: t('filters.priceRange'),
              verifiedOnly: t('filters.verifiedOnly'),
              categories: [
                { value: 'all', label: t('filters.allCategories') },
                { value: 'ceramics', label: tCategories('ceramics') },
                { value: 'textiles', label: tCategories('textiles') },
                { value: 'jewelry', label: tCategories('jewelry') },
                { value: 'woodwork', label: tCategories('woodwork') },
                { value: 'painting', label: tCategories('painting') },
              ],
              sortOptions: [
                ...(hasQuery
                  ? [{ value: 'relevance', label: t('filters.relevance') }]
                  : []),
                { value: 'newest', label: t('filters.newest') },
                { value: 'oldest', label: t('filters.oldest') },
                { value: 'price_asc', label: t('filters.priceLowToHigh') },
                { value: 'price_desc', label: t('filters.priceHighToLow') },
              ],
            }}
          />
        </Suspense>

        {/* Search Statistics */}
        <SearchStats
          query={searchParams.q}
          totalResults={pagination.total}
          hasFilters={hasFilters}
          processingTime={0} // Will be populated by the search function
          locale={params.locale}
        />

        {/* Products Grid */}
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={{
                    ...product,
                    images: product.images.map(img => ({
                      url: img.url,
                      alt: img.alt || product.title,
                    })),
                    seller: {
                      displayName: product.seller.displayName,
                      shopName: product.seller.shopName,
                      verified: product.seller.verified,
                    },
                  }}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <ExplorePagination
                currentPage={pagination.page}
                totalPages={pagination.pages}
                searchParams={searchParams}
                locale={params.locale}
              />
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <div className="h-12 w-12 mx-auto mb-4 opacity-50 bg-gray-200 rounded-full flex items-center justify-center">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <p className="text-lg">
                {hasQuery ? t('noSearchResults') : t('noResults')}
              </p>
              <p className="text-sm">
                {hasQuery
                  ? t('noSearchResultsDescription')
                  : t('noResultsDescription')}
              </p>
              {(hasQuery || hasFilters) && (
                <div className="mt-4">
                  <a
                    href={`/${params.locale}/explore`}
                    className="text-primary hover:underline"
                  >
                    {t('clearAllFilters')}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Tips for Empty Results */}
        {products.length === 0 && hasQuery && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-3">
              {t('searchTips.title')}
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• {t('searchTips.tip1')}</li>
              <li>• {t('searchTips.tip2')}</li>
              <li>• {t('searchTips.tip3')}</li>
              <li>• {t('searchTips.tip4')}</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
