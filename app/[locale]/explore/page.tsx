import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { ProductCard } from '@/components/products/ProductCard';
import { ExploreFilters } from '@/components/explore/ExploreFilters';
import { ExplorePagination } from '@/components/explore/ExplorePagination';

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

async function getProducts(searchParams: PageProps['searchParams']) {
  const search = searchParams.search;
  const category = searchParams.category;
  const sort = searchParams.sort || 'newest';
  const page = parseInt(searchParams.page || '1');
  const skip = (page - 1) * PRODUCTS_PER_PAGE;

  const where: any = {
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
  let orderBy: any = { createdAt: 'desc' }; // newest (default)
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
        images: true
      },
      orderBy,
      take: PRODUCTS_PER_PAGE,
      skip
    }),
    prisma.product.count({ where })
  ]);

  return {
    products,
    totalCount,
    totalPages: Math.ceil(totalCount / PRODUCTS_PER_PAGE),
    currentPage: page
  };
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const t = await getTranslations('explore');
  
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
  const t = await getTranslations('explore');
  const { products, totalCount, totalPages, currentPage } = await getProducts(searchParams);

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