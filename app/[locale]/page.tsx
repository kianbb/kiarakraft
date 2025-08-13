import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/products/ProductCard';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const { locale } = params;
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
const sampleProducts = [
  {
    id: "1",
    title: "کاسه سرامیکی دست‌ساز",
    slug: "handmade-ceramic-bowl",
    description: "کاسه زیبای سرامیکی ساخته شده با تکنیک‌های سنتی ایرانی",
    priceToman: 450000,
    stock: 12,
    images: [{ url: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop", alt: "کاسه سرامیکی" }],
    seller: {
      displayName: "کارگاه کیارا",
      shopName: "Atelier Kiara"
    }
  },
  {
    id: "2",
    title: "گردنبند نقره با سنگ فیروزه",
    slug: "silver-turquoise-necklace",
    description: "گردنبند زیبای نقره دست‌ساز با سنگ فیروزه طبیعی نیشابوری",
    priceToman: 1250000,
    stock: 8,
    images: [{ url: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop", alt: "گردنبند فیروزه" }],
    seller: {
      displayName: "کارگاه کیارا",
      shopName: "Atelier Kiara"
    }
  }
];

export default async function Home({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const isRTL = locale === 'fa';
  const t = await getTranslations('home');
  

  return (
    <div className="min-h-screen">
      <main role="main">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-background to-muted/30 py-20" aria-labelledby="hero-title">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
                { name: 'سرامیک', slug: 'ceramics' },
                { name: 'نساجی', slug: 'textiles' },
                { name: 'جواهرات', slug: 'jewelry' },
                { name: 'صنایع چوبی', slug: 'woodwork' },
                { name: 'نقاشی', slug: 'painting' }
              ].map((category) => (
                <Link
                  key={category.slug}
                  href={`/fa/explore?category=${category.slug}`}
                  className="group"
                >
                  <div className="p-6 bg-card border border-border rounded-lg hover:shadow-md transition-all duration-200 text-center group-hover:-translate-y-1">
                    <div className="w-16 h-16 bg-primary/10 rounded-full mx-auto mb-4 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <span className="text-2xl">🎨</span>
                    </div>
                    <p className="font-medium text-foreground">{category.name}</p>
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
                  {isRTL ? 'مشاهده همه محصولات' : 'View All Products'}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
