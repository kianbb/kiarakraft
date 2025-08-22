import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ProductCard } from '@/components/products/ProductCard';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Badge } from '@/components/ui/badge';
import { Metadata } from 'next';

interface ShopPageProps {
  params: {
    locale: string;
    handle: string;
  };
  searchParams: {
    page?: string;
  };
}

async function getSellerByHandle(handle: string) {
  return await prisma.sellerProfile.findUnique({
    where: { handle },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      products: {
        where: {
          active: true,
          isTest: false,
        },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: {
              url: true,
              alt: true,
            },
          },
          seller: {
            select: {
              handle: true,
              displayName: true,
              shopName: true,
              verified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      _count: {
        select: {
          products: {
            where: {
              active: true,
              isTest: false,
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: ShopPageProps): Promise<Metadata> {
  const seller = await getSellerByHandle(params.handle);

  if (!seller) {
    return {
      title: 'فروشگاه یافت نشد - کیارا کرفت',
      description: 'فروشگاه مورد نظر یافت نشد.',
    };
  }

  const title =
    params.locale === 'fa'
      ? `فروشگاه ${seller.displayName} - کیارا کرفت`
      : `${seller.displayName} Shop - Kiara Kraft`;

  const description =
    params.locale === 'fa'
      ? `محصولات دست‌ساز ${seller.displayName} در کیارا کرفت. ${seller._count.products} محصول موجود.`
      : `Handmade products by ${seller.displayName} on Kiara Kraft. ${seller._count.products} products available.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: seller.bannerUrl ? [seller.bannerUrl] : undefined,
    },
  };
}

export default async function ShopPage({ params }: ShopPageProps) {
  const seller = await getSellerByHandle(params.handle);

  if (!seller) {
    notFound();
  }

  const isRTL = params.locale === 'fa';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Shop Header */}
      <div className="relative mb-8">
        {/* Banner */}
        {seller.bannerUrl && (
          <div className="w-full h-48 md:h-64 relative rounded-lg overflow-hidden mb-6">
            <OptimizedImage
              src={seller.bannerUrl}
              alt={`${seller.displayName} banner`}
              fill
              className="object-cover"
              sizes="100vw"
            />
          </div>
        )}

        {/* Seller Info */}
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 md:w-24 md:h-24 relative rounded-full overflow-hidden bg-gray-200">
              {seller.avatarUrl ? (
                <OptimizedImage
                  src={seller.avatarUrl}
                  alt={seller.displayName}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 80px, 96px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xl font-bold">
                  {seller.displayName.charAt(0)}
                </div>
              )}
            </div>
          </div>

          {/* Shop Details */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {seller.displayName}
              </h1>
              {seller.verified && (
                <Badge variant="default" className="bg-blue-100 text-blue-800">
                  {isRTL ? 'تأیید شده' : 'Verified'}
                </Badge>
              )}
            </div>

            <p className="text-gray-600 mb-2">@{seller.handle}</p>

            {seller.bio && (
              <p className="text-gray-700 max-w-2xl leading-relaxed">
                {seller.bio}
              </p>
            )}

            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
              <span>
                {isRTL
                  ? `${seller._count.products} محصول`
                  : `${seller._count.products} products`}
              </span>
              <span>
                {isRTL
                  ? `عضو از ${new Date(seller.createdAt).toLocaleDateString('fa-IR')}`
                  : `Member since ${new Date(seller.createdAt).toLocaleDateString('en-US')}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Products Section */}
      <div>
        <h2 className="text-xl font-semibold mb-6 text-gray-900">
          {isRTL ? 'محصولات' : 'Products'}
        </h2>

        {seller.products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {isRTL
                ? 'هنوز محصولی در این فروشگاه وجود ندارد.'
                : 'No products in this shop yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {seller.products.map(product => (
              <ProductCard
                key={product.id}
                product={{
                  ...product,
                  images: product.images.map(
                    (img: { url: string; alt: string | null }) => ({
                      url: img.url,
                      alt: img.alt || undefined,
                    })
                  ),
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
