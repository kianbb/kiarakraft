'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';
import { OrderWithItems } from '@/types/database';
import { CheckCircle, Package, MapPin, CreditCard, Home } from 'lucide-react';

export default function OrderConfirmationPage() {
  const params = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('order');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setOrder(data);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Error fetching order:', error);
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }
    fetchOrder();
  }, [session, router, fetchOrder]);

  if (!session || loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="bg-gray-200 h-8 rounded mb-8"></div>
            <div className="bg-gray-200 h-64 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  // Use individual address fields from order object directly

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Success Header */}
        <div className="text-center mb-12">
          <CheckCircle className="h-16 w-16 mx-auto mb-6 text-green-500" />
          <h1 className="text-3xl font-bold mb-4">{t('success')}</h1>
          <p className="text-lg text-muted-foreground">
            {t('orderNumber')}: <span className="font-mono font-semibold">{order.id}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Details */}
          <div className="space-y-6">
            <div className="border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-5 w-5" />
                <h2 className="text-xl font-semibold">{t('orderDetails')}</h2>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>{t('status')}</span>
                  <Badge variant={order.status === 'PENDING' ? 'secondary' : 'default'}>
                    {t(`status_${order.status.toLowerCase()}`)}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>{t('paymentStatus')}</span>
                  <Badge variant={order.status === 'PENDING' ? 'secondary' : 'default'}>
                    {t(`payment_${order.status.toLowerCase()}`)}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>{t('orderDate')}</span>
                  <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Shipping Information */}
            <div className="border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5" />
                <h2 className="text-xl font-semibold">{t('shippingInfo')}</h2>
              </div>

              <div className="space-y-2 text-sm">
                <div><strong>{order.fullName}</strong></div>
                <div>{order.phone}</div>
                <div>{order.address1}{order.address2 ? `, ${order.address2}` : ''}</div>
                <div>{order.city}, {order.province}</div>
                <div>{order.postalCode}</div>
              </div>
            </div>

            {/* Payment Information */}
            <div className="border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5" />
                <h2 className="text-xl font-semibold">{t('paymentMethod')}</h2>
              </div>

              <div className="text-sm">
                {t('cashOnDelivery')}
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">{t('orderItems')}</h2>
            
            <div className="space-y-4">
              {order.items?.map((item: OrderWithItems['items'][0]) => (
                <div key={item.id} className="flex gap-4 p-4 border rounded-lg">
                  <div className="relative w-16 h-16 rounded overflow-hidden bg-gray-100">
                    <Image
                      src={item.product.images[0]?.url || '/placeholder-product.jpg'}
                      alt={item.product.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-semibold">{item.product.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('quantity')}: {item.quantity}
                    </div>
                    <div className="font-semibold">
                      {formatPrice(item.unitPriceToman * item.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Totals */}
            <div className="border rounded-lg p-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>{t('subtotal')}</span>
                  <span>{formatPrice(order.items?.reduce((sum, item) => sum + (item.unitPriceToman * item.quantity), 0) || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('shipping')}</span>
                  <span>{formatPrice(0)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>{t('total')}</span>
                  <span>{formatPrice(order.totalToman)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/">
                <Button variant="outline" className="w-full">
                  <Home className="h-4 w-4 mr-2" />
                  {t('backToHome')}
                </Button>
              </Link>
              <Link href="/explore">
                <Button className="w-full">
                  {t('continueShopping')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}