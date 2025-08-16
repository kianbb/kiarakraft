import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/products/ProductCard';
import { Metadata } from 'next';

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

// Sample product data for demo - in real app this would come from API/database
// Updated to use proper translations instead of hardcoded text
function getSampleProducts(t: Awaited<ReturnType<typeof getTranslations<'home'>>>) {
  return [
    {
      id: "1",
      title: t('sampleProducts.ceramicBowl.title'),
      slug: "handmade-ceramic-bowl",
      description: t('sampleProducts.ceramicBowl.description'),
      priceToman: 450000,
      stock: 12,
      images: [{ url: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop", alt: t('sampleProducts.ceramicBowl.title') }],
      seller: {
        displayName: t('sampleProducts.shopName'),
        shopName: "Atelier Kiara"
      }
    },
    {
      id: "2",
      title: t('sampleProducts.silverNecklace.title'),
      slug: "silver-turquoise-necklace",
      description: t('sampleProducts.silverNecklace.description'),
      priceToman: 1250000,
      stock: 8,
      images: [{ url: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop", alt: t('sampleProducts.silverNecklace.title') }],
      seller: {
        displayName: t('sampleProducts.shopName'),
        shopName: "Atelier Kiara"
      }
    }
  ];
}

export default async function Home({ params }: { params: { locale: string } }) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tCategories = await getTranslations('categories');
  const sampleProducts = getSampleProducts(t);
  

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
              sizes="100vw"
              quality={85}
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
            <Link href={`/${locale}/explore`}>
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
              {[
                { nameKey: 'ceramics', slug: 'ceramics', image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=128&h=128&fit=crop&q=80' },
                { nameKey: 'textiles', slug: 'textiles', image: 'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=128&h=128&fit=crop&q=80' },
                { nameKey: 'jewelry', slug: 'jewelry', image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=128&h=128&fit=crop&q=80' },
                { nameKey: 'woodwork', slug: 'woodwork', image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=128&h=128&fit=crop&q=80' },
                { nameKey: 'painting', slug: 'painting', image: 'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=128&h=128&fit=crop&q=80' }
              ].map((category) => (
                <Link
                  key={category.slug}
                  href={`/${locale}/explore?category=${category.slug}`}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sampleProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <div className="text-center mt-12">
              <Link href={`/${locale}/explore`}>
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
