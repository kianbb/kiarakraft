import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatPrice, formatDate } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  Package,
  Truck,
  CheckCircle,
  MapPin,
  Phone,
  User,
  ArrowLeft,
  CreditCard,
  Box,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { CopyOrderIdButton } from '@/components/order/CopyOrderIdButton';
import { returnIneligibility } from '@/lib/return-eligibility';
import {
  buyerShippingSelect,
  buyerShippingTimeline,
  toBuyerShipping,
  type BuyerShipping,
} from '@/lib/order-read';

interface OrderDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function getOrderById(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
              seller: {
                select: {
                  displayName: true,
                  handle: true,
                },
              },
            },
          },
          returnRequest: { select: { status: true } },
        },
      },
      payment: true,
      shipping: { select: buyerShippingSelect },
      address: true,
    },
  });
  if (!order) return null;
  const { shipping, ...details } = order;
  return {
    ...details,
    shipping: toBuyerShipping(shipping),
    returnIneligibility: returnIneligibility(order),
  };
}

interface OrderWithDetails {
  createdAt: Date;
  updatedAt: Date;
  status: string;
  payment?: {
    status: string;
    updatedAt: Date;
  } | null;
  shipping: BuyerShipping | null;
}

function getOrderTimeline(order: OrderWithDetails, t: (key: string) => string) {
  const timeline = [];

  // Order placed
  timeline.push({
    date: order.createdAt,
    title: t('orderPlaced'),
    status: 'completed',
    icon: Package,
  });

  // Payment
  if (order.payment) {
    if (order.payment.status === 'PAID') {
      timeline.push({
        date: order.payment.updatedAt,
        title: t('paymentConfirmed'),
        status: 'completed',
        icon: CreditCard,
      });
    } else if (order.payment.status === 'FAILED') {
      timeline.push({
        date: order.payment.updatedAt,
        title: t('paymentFailed'),
        status: 'failed',
        icon: CreditCard,
      });
    }
  }

  // Shipping updates
  if (order.shipping) {
    const events = buyerShippingTimeline(order.shipping, {
      status: order.status,
      updatedAt: order.updatedAt.toISOString(),
    });
    const phases = [
      { status: 'PROCESSING', label: 'preparingShipment', icon: Box },
      { status: 'SHIPPED', label: 'shipped', icon: Truck },
      { status: 'DELIVERED', label: 'delivered', icon: CheckCircle },
      { status: 'RETURNED', label: 'returned', icon: RotateCcw },
    ];
    for (const phase of phases) {
      const event = events.find(event => event.status === phase.status);
      if (!event) continue;
      const trackingNo =
        phase.status === 'SHIPPED'
          ? (order.shipping.trackingNo ?? event.trackingNo)
          : undefined;
      timeline.push({
        date: new Date(event.timestamp),
        title: t(phase.label),
        subtitle: trackingNo ? `${t('tracking')}: ${trackingNo}` : undefined,
        status: 'completed',
        icon: phase.icon,
      });
    }
  }

  return timeline.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { locale, id } = await params;
  const session = await auth();

  if (!session) {
    redirect('/auth/login');
  }

  const [t, tReturns] = await Promise.all([
    getTranslations('orders'),
    getTranslations('returns'),
  ]);
  const order = await getOrderById(id, session.user.id);
  const isRTL = locale === 'fa';

  if (!order) {
    notFound();
  }

  const canRequestReturn =
    order.returnIneligibility === null &&
    order.items.some(item => !item.returnRequest);
  const timeline = getOrderTimeline(order, t);
  const subtotal = order.items.reduce(
    (sum, item) => sum + item.unitPriceToman * item.quantity,
    0
  );
  const shippingCost = order.shipping?.priceToman || 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/${locale}/account/orders`}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
          {t('backToOrders')}
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('orderDetails')}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                {t('orderNumber')}:{' '}
                <span className="font-mono">#{order.id.slice(-8)}</span>
              </span>
              <CopyOrderIdButton orderId={order.id} label={t('copyId')} />
            </div>
          </div>
          <div>
            <Badge
              variant={
                order.status === 'PAID'
                  ? 'default'
                  : order.status === 'CANCELLED'
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {t(order.status.toLowerCase())}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Order Timeline */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6">{t('orderStatus')}</h2>

            <div className="space-y-4">
              {timeline.map((event, index) => {
                const Icon = event.icon;
                const isLast = index === timeline.length - 1;

                return (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          event.status === 'completed'
                            ? 'bg-green-100 text-green-600'
                            : event.status === 'failed'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <p className="font-medium">{event.title}</p>
                      {event.subtitle && (
                        <p className="text-sm text-gray-600 mt-1">
                          {event.subtitle}
                        </p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        {formatDate(
                          event.date,
                          locale === 'fa' ? 'fa-IR' : 'en-US'
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6">{t('orderItems')}</h2>

            <div className="space-y-4">
              {order.items.map(item => (
                <div key={item.id} className="flex gap-4">
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    {item.product.images[0] && (
                      <OptimizedImage
                        src={item.product.images[0].url}
                        alt={item.product.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    )}
                  </div>

                  <div className="flex-1">
                    <Link
                      href={`/${locale}/product/${item.product.slug}`}
                      className="font-medium hover:text-blue-600"
                    >
                      {item.product.title}
                    </Link>
                    <p className="text-sm text-gray-600 mt-1">
                      {t('seller')}: {item.product.seller.displayName}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm text-gray-500">
                          {t('quantity')}: {item.quantity}
                        </p>
                        {item.returnRequest && (
                          <Badge
                            variant={
                              item.returnRequest.status === 'APPROVED'
                                ? 'default'
                                : item.returnRequest.status === 'REJECTED'
                                  ? 'destructive'
                                  : item.returnRequest.status === 'REFUNDED'
                                    ? 'default'
                                    : 'secondary'
                            }
                            className="text-xs w-fit"
                          >
                            {t(
                              `return${item.returnRequest.status.toLowerCase().replace(/^./, c => c.toUpperCase())}`
                            )}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium">
                        {formatPrice(
                          item.unitPriceToman * item.quantity,
                          locale
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Delivery Address */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t('deliveryAddress')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <span>{order.address.fullName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{order.address.phone}</span>
              </div>
              <div className="mt-3 pt-3 border-t">
                <p>{order.address.line1}</p>
                {order.address.line2 && <p>{order.address.line2}</p>}
                <p>
                  {order.address.city}, {order.address.province}
                </p>
                {order.address.postal && (
                  <p>
                    {t('postalCode')}: {order.address.postal}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Shipping Information */}
          {order.shipping && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Truck className="h-5 w-5" />
                {t('shippingInfo')}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('method')}:</span>
                  <span className="font-medium">
                    {t(`${order.shipping.method.toLowerCase()}Shipping`)}
                  </span>
                </div>
                {order.shipping.trackingNo && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      {t('trackingNumber')}:
                    </span>
                    <span className="font-mono font-medium">
                      {order.shipping.trackingNo}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('status')}:</span>
                  <Badge variant="outline">
                    {t(order.shipping.status.toLowerCase())}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Payment Summary */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('paymentSummary')}
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('subtotal')}:</span>
                <span>{formatPrice(subtotal, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t('shipping')}:</span>
                <span>{formatPrice(shippingCost, locale)}</span>
              </div>
              <div className="pt-3 border-t">
                <div className="flex justify-between">
                  <span className="font-semibold">{t('total')}:</span>
                  <span className="font-semibold text-lg">
                    {formatPrice(order.totalToman, locale)}
                  </span>
                </div>
              </div>
              {order.payment && (
                <div className="pt-3 border-t">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('paymentMethod')}:</span>
                    <span>{t(order.payment.gateway.toLowerCase())}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-gray-600">{t('paymentStatus')}:</span>
                    <Badge
                      variant={
                        order.payment.status === 'PAID'
                          ? 'default'
                          : order.payment.status === 'FAILED'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {t(order.payment.status.toLowerCase())}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {canRequestReturn && (
              <Link href={`/${locale}/account/orders/${order.id}/return`}>
                <Button variant="outline" className="w-full">
                  <RotateCcw className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('requestReturn')}
                </Button>
              </Link>
            )}
            {order.returnIneligibility === 'delivery_unconfirmed' && (
              <div className="rounded-lg border p-4 text-sm">
                <p className="mb-2 text-muted-foreground">
                  {tReturns('deliveryUnconfirmed')}
                </p>
                <Link
                  href={`/${locale}/contact`}
                  className="text-primary underline"
                >
                  {tReturns('contactSupport')}
                </Link>
              </div>
            )}
            {order.status === 'DELIVERED' && (
              <Link href={`/${locale}/account/orders/${order.id}/review`}>
                <Button className="w-full">{t('leaveReview')}</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
