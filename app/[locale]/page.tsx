import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/products/ProductCard';
import { Metadata } from 'next';
import { searchProducts } from '@/lib/search';
import { prisma } from '@/lib/prisma';

// Pre-render both locales for the dynamic [locale] segment to ensure correct SSG per-locale
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ locale: 'fa' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const { locale } = params;
  setRequestLocale(locale);
  const isRTL = locale === 'fa';
  
  return {
    title: isRTL ? 'خانه | کیارا کرفت - بازار دستسازهای ایرانی' : 'Home | Kiara Kraft - Iranian Handmade Marketplace',
    description: isRTL 
      ? 'محصولات منحصر به فرد دست‌ساز ایرانی را کشف کنید. از صنایع دستی سنتی تا هنرهای مدرن. از هنرمندان محلی حمایت کنید.'
      : 'Discover unique Iranian handcrafted products. From traditional crafts to modern artistry. Support local artisans.',
    alternates: {
      canonical: `/${locale}`,
      languages: {
        'fa': '/fa',
        'en': '/en',
      },
    },
    openGraph: {
      title: isRTL ? 'کیارا کرفت - بازار دستسازهای ایرانی' : 'Kiara Kraft - Iranian Handmade Marketplace',
      description: isRTL 
        ? 'محصولات منحصر به فرد دست‌ساز ایرانی را کشف کنید'
        : 'Discover unique Iranian handcrafted products',
      url: `/${locale}`,
      locale: isRTL ? 'fa_IR' : 'en_US',
    },
  };
}

// Fetch real featured products from database
async function getFeaturedProducts(locale: string) {
  try {
    const results = await searchProducts({
      sortBy: 'newest',
      limit: 4, // Show 4 featured products
      locale
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
        alt: img.alt || product.title
      })),
      seller: {
        displayName: product.seller.displayName,
        shopName: product.seller.shopName,
        verified: product.seller.verified
      }
    }));
  } catch (error) {
    console.error('Error fetching featured products:', error);
    // Return empty array if there's an error
    return [];
  }
}

// Build category tiles with a representative image per category
async function getCategoryTiles() {
  // Safe fallbacks to avoid build-time DB dependency
  const staticFallback = [
    { nameKey: 'ceramics', slug: 'ceramics', image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=400&h=400&fit=crop&q=80' },
    { nameKey: 'textiles', slug: 'textiles', image: 'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=400&h=400&fit=crop&q=80' },
    { nameKey: 'jewelry', slug: 'jewelry', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&h=400&fit=crop&q=80' },
    { nameKey: 'woodwork', slug: 'woodwork', image: 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=400&h=400&fit=crop&q=80' },
    { nameKey: 'painting', slug: 'painting', image: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400&h=400&fit=crop&q=80' }
  ] as const;

  try {
    // Fetch all categories (small fixed set)
    const categories = await prisma.category.findMany({
      select: { id: true, slug: true }
    });

    // For each category, pick the most recent approved product's first image
    const tiles = await Promise.all(
      categories.map(async (c) => {
        const product = await prisma.product.findFirst({
          where: {
            active: true,
            eligibilityStatus: 'APPROVED',
            categoryId: c.id,
            images: { some: {} }
          },
          orderBy: { createdAt: 'desc' },
          select: {
            images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 }
          }
        });
        const fallbackBySlug: Record<string, string> = {
          ceramics: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=400&h=400&fit=crop&q=80',
          textiles: 'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=400&h=400&fit=crop&q=80',
          jewelry: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&h=400&fit=crop&q=80',
          woodwork: 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=400&h=400&fit=crop&q=80',
          painting: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400&h=400&fit=crop&q=80'
        };
        return {
          nameKey: c.slug,
          slug: c.slug,
          image: product?.images?.[0]?.url || fallbackBySlug[c.slug] || '/kk-logo-original.png'
        };
      })
    );

    // Preserve the desired display order
    const order = ['ceramics', 'textiles', 'jewelry', 'woodwork', 'painting'];
    return tiles.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  } catch {
    // If DB is not reachable at build time, use fallbacks
    return staticFallback as unknown as Array<{ nameKey: string; slug: string; image: string }>;
  }
}

export default async function Home({ params }: { params: { locale: string } }) {
  const { locale } = params;
  setRequestLocale(locale);
  // Use explicit locale to avoid default-locale bleed during SSG/ISR
  const t = await getTranslations({ locale, namespace: 'home' });
  const tCategories = await getTranslations({ locale, namespace: 'categories' });
  const featuredProducts = await getFeaturedProducts(locale);
  const categoryTiles = await getCategoryTiles();
  

  return (
    <div className="min-h-screen">
      <main role="main">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-background to-muted/30 py-20 overflow-hidden" aria-labelledby="hero-title">
          {/* Background Image */}
          <div className="absolute inset-0 -z-10">
            <Image
              src="https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1920&h=1080&fit=crop&q=80"
              alt=""
              fill
              className="object-cover opacity-5"
              priority
              fetchPriority="high"
              sizes="100vw"
              quality={70}
            />
          </div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 id="hero-title" className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              {t('hero.title')}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-6">
              {t('hero.subtitle')}
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              {t('hero.description')}
            </p>
            <Link href={`/${locale}/explore`} prefetch={false}>
              <Button size="lg" className="px-8 py-3 text-lg">
                {t('hero.cta')}
              </Button>
            </Link>
          </div>
        </section>

        {/* Featured Categories */}
        <section className="py-16 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h3 className="text-3xl font-bold text-center mb-12">
              {t('featured.categories')}
            </h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
    {categoryTiles.map((category) => (
                <Link
                  key={category.slug}
          href={`/${locale}/explore?category=${category.slug}`}
          prefetch={false}
                  className="group"
                >
                  <div className="p-6 bg-card border border-border rounded-lg hover:shadow-md transition-all duration-200 text-center group-hover:-translate-y-1">
                    <div className="relative w-16 h-16 mx-auto mb-4 rounded-full overflow-hidden group-hover:scale-105 transition-transform">
                      <Image
                        src={category.image}
                        alt={tCategories(category.nameKey)}
                        fill
                        className="object-cover"
                        sizes="64px"
                        quality={80}
                      />
                    </div>
                    <p className="font-medium text-foreground">{tCategories(category.nameKey)}</p>
                  </div>
                </Link>
        ))}
            </div>
          </div>
        </section>

        {/* Featured Products */}
        <section className="py-16 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h3 className="text-3xl font-bold text-center mb-12">
              {t('featured.products')}
            </h3>
            {featuredProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {featuredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {t('noFeaturedProducts') || 'No featured products available at the moment.'}
                </p>
                <Link href={`/${locale}/explore`} prefetch={false}>
                  <Button variant="outline">
                    {t('viewAllProducts')}
                  </Button>
                </Link>
              </div>
            )}
            <div className="text-center mt-12">
              <Link href={`/${locale}/explore`} prefetch={false}>
                <Button variant="outline" size="lg">
                  {t('viewAllProducts')}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
