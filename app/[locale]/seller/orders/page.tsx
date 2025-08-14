'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatPrice, formatDate } from '@/lib/utils';
import { OrderWithItems } from '@/types/database';
import { 
  Search, 
  Package,
  ArrowLeft,
  Calendar,
  User
} from 'lucide-react';

export default function SellerOrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations('seller');
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/login');
      return;
    }

    if (session.user?.role !== 'SELLER') {
      router.push('/');
      return;
    }

    fetchOrders();
  }, [session, status, router]);

  const fetchOrders = async () => {
    try {
      const response = await fetch('/api/seller/orders');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary">{t('statusPending')}</Badge>;
      case 'PROCESSING':
        return <Badge variant="default">{t('statusProcessing')}</Badge>;
      case 'SHIPPED':
        return <Badge variant="outline">{t('statusShipped')}</Badge>;
      case 'DELIVERED':
        return <Badge className="bg-green-100 text-green-800">{t('statusDelivered')}</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">{t('statusCancelled')}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredOrders = orders.filter((order: OrderWithItems) =>
    order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.items.some((item: OrderWithItems['items'][0]) => 
      item.product.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-8">
            <div className="bg-gray-200 h-8 rounded"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-gray-200 h-32 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session || session.user?.role !== 'SELLER') {
    return null;
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link href="/seller" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{t('orders')}</h1>
              <p className="text-muted-foreground">{t('manageYourOrders')}</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder={t('searchOrders')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length > 0 ? (
          <div className="space-y-6">
            {filteredOrders.map((order: OrderWithItems) => (
              <div key={order.id} className="bg-white rounded-lg border p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-primary" />
                    <div>
                      <h3 className="font-semibold">{t('orderNumber')}: {order.id.slice(-8).toUpperCase()}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {formatDate(order.createdAt)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {getStatusBadge(order.status)}
                    <div className="text-right">
                      <div className="font-bold">
                        {formatPrice(order.items.reduce((sum: number, item: OrderWithItems['items'][0]) => sum + item.unitPriceToman * item.quantity, 0))}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {order.items.reduce((sum: number, item: OrderWithItems['items'][0]) => sum + item.quantity, 0)} {t('items')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t('customer')}:</span>
                  <span className="text-sm">{order.fullName}</span>
                </div>

                {/* Order Items */}
                <div className="space-y-3">
                  <h4 className="font-medium">{t('orderItems')}:</h4>
                  {order.items.map((item: OrderWithItems['items'][0]) => (
                    <div key={item.id} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                        <Image
                          src={item.product.images[0]?.url || '/placeholder-product.jpg'}
                          alt={item.product.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      
                      <div className="flex-1">
                        <h5 className="font-medium line-clamp-1">{item.product.title}</h5>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{t('quantity')}: {item.quantity}</span>
                          <span>{t('price')}: {formatPrice(item.unitPriceToman)}</span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-semibold">{formatPrice(item.unitPriceToman * item.quantity)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping Address */}
                {/* Shipping Address */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium mb-2">{t('shippingAddress')}:</h4>
                  <div className="text-sm text-muted-foreground">
                    <div>{order.fullName}</div>
                    <div>{order.address1} {order.address2 ? `, ${order.address2}` : ''}</div>
                    <div>{order.city}, {order.province} {order.postalCode}</div>
                    <div>{t('phone')}: {order.phone}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-4">
              {searchTerm ? t('noOrdersFound') : t('noOrders')}
            </h2>
            <p className="text-muted-foreground">
              {searchTerm ? t('tryDifferentSearch') : t('noOrdersDescription')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}