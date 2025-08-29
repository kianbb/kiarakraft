import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatPrice, formatDate } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Package, ChevronRight, Truck, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';

interface OrdersPageProps {
  params: { locale: string };
}

async function getUserOrders(userId: string) {
  return await prisma.order.findMany({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: {
                take: 1,
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      },
      payment: true,
      shipping: true,
      address: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    PENDING: {
      label: t('pending'),
      variant: 'secondary' as const,
      icon: Clock,
    },
    PAID: { label: t('paid'), variant: 'default' as const, icon: CheckCircle },
    PROCESSING: {
      label: t('processing'),
      variant: 'outline' as const,
      icon: Package,
    },
    SHIPPED: { label: t('shipped'), variant: 'default' as const, icon: Truck },
    DELIVERED: {
      label: t('delivered'),
      variant: 'default' as const,
      icon: CheckCircle,
    },
    CANCELLED: {
      label: t('cancelled'),
      variant: 'destructive' as const,
      icon: Clock,
    },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

interface ShippingInfo {
  status: string;
  trackingNo?: string | null;
}

function getShippingStatus(
  shipping: ShippingInfo | null,
  t: (key: string) => string
) {
  if (!shipping) return null;

  const statusConfig = {
    PROCESSING: { label: t('preparingShipment'), color: 'text-yellow-600' },
    SHIPPED: { label: t('inTransit'), color: 'text-blue-600' },
    DELIVERED: { label: t('delivered'), color: 'text-green-600' },
    RETURNED: { label: t('returned'), color: 'text-red-600' },
  };

  const config = statusConfig[shipping.status as keyof typeof statusConfig];
  if (!config) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Truck className={`h-4 w-4 ${config.color}`} />
      <span className={config.color}>{config.label}</span>
      {shipping.trackingNo && (
        <span className="text-gray-500">#{shipping.trackingNo}</span>
      )}
    </div>
  );
}

export default async function OrdersPage({ params }: OrdersPageProps) {
  const session = await auth();

  if (!session) {
    redirect('/auth/login');
  }

  const t = await getTranslations('orders');
  const orders = await getUserOrders(session.user.id);
  const isRTL = params.locale === 'fa';

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('myOrders')}</h1>
        <p className="text-muted-foreground">
          {t('totalOrders', { count: orders.length })}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">{t('noOrders')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('noOrdersDescription')}
          </p>
          <Link href="/explore">
            <Button size="lg">{t('startShopping')}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const itemCount = order.items.reduce(
              (sum, item) => sum + item.quantity,
              0
            );

            return (
              <Link
                key={order.id}
                href={`/${params.locale}/account/orders/${order.id}`}
                className="block"
              >
                <div className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-sm text-gray-500">
                          {t('orderNumber')}:{' '}
                          <span className="font-mono">
                            #{order.id.slice(-8)}
                          </span>
                        </p>
                        {getStatusBadge(order.status, t)}
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatDate(order.createdAt, isRTL ? 'fa-IR' : 'en-US')}
                      </p>
                    </div>
                    <ChevronRight
                      className={`h-5 w-5 text-gray-400 ${isRTL ? 'rotate-180' : ''}`}
                    />
                  </div>

                  {/* Order Items Preview */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex -space-x-2">
                      {order.items.slice(0, 3).map((item, index) => (
                        <div
                          key={item.id}
                          className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-gray-100"
                          style={{ zIndex: 3 - index }}
                        >
                          {item.product.images[0] && (
                            <OptimizedImage
                              src={item.product.images[0].url}
                              alt={item.product.title}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          )}
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <div className="w-12 h-12 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-sm font-medium">
                          +{order.items.length - 3}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {itemCount} {t(itemCount === 1 ? 'item' : 'items')}
                      </p>
                      <p className="text-sm text-gray-500">
                        {order.items
                          .slice(0, 2)
                          .map(item => item.product.title)
                          .join(', ')}
                        {order.items.length > 2 && '...'}
                      </p>
                    </div>
                  </div>

                  {/* Shipping Status */}
                  {order.shipping && getShippingStatus(order.shipping, t)}

                  {/* Footer */}
                  <div className="flex justify-between items-center mt-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-500">{t('total')}</p>
                      <p className="text-lg font-semibold">
                        {formatPrice(order.totalToman, params.locale)}
                      </p>
                    </div>

                    {/* Delivery Address */}
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{t('deliveryTo')}</p>
                      <p className="text-sm font-medium">
                        {order.address.city}, {order.address.province}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
