'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';
import { OrderWithItems, ProductWithRelations, SellerStats } from '@/types/database';
import { 
  Package, 
  ShoppingCart, 
  DollarSign, 
  Star,
  Plus,
  Eye,
  Edit,
  Users
} from 'lucide-react';

export default function SellerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('seller');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderWithItems[]>([]);
  const [recentProducts, setRecentProducts] = useState<ProductWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

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

    fetchDashboardData();
  }, [session, status, router]);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, ordersRes, productsRes] = await Promise.all([
        fetch('/api/seller/stats'),
        fetch('/api/seller/orders?limit=5'),
        fetch('/api/seller/products?limit=5')
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setRecentOrders(ordersData);
      }

      if (productsRes.ok) {
        const productsData = await productsRes.json();
        setRecentProducts(productsData);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-8">
            <div className="bg-gray-200 h-8 rounded mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-200 h-24 rounded"></div>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{t('dashboard')}</h1>
          <p className="text-muted-foreground">
            {t('welcome')}, {session.user.name}!
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t('totalProducts')}</h3>
                <p className="text-2xl font-bold">{stats?.totalProducts || 0}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t('totalOrders')}</h3>
                <p className="text-2xl font-bold">{stats?.totalOrders || 0}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-green-600" />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t('totalRevenue')}</h3>
                <p className="text-2xl font-bold">{formatPrice(stats?.totalRevenue || 0)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t('averageRating')}</h3>
                <p className="text-2xl font-bold">{stats?.averageRating || '0.0'}</p>
              </div>
              <Star className="h-8 w-8 text-yellow-600" />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link href="/seller/products">
            <div className="bg-white p-6 rounded-lg border hover:shadow-lg transition-shadow cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <Package className="h-6 w-6 text-blue-600" />
                <h3 className="font-semibold">{t('manageProducts')}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('addEditProducts')}</p>
              <Button variant="outline" size="sm">
                {t('viewProducts')}
              </Button>
            </div>
          </Link>
          
          <Link href="/seller/orders">
            <div className="bg-white p-6 rounded-lg border hover:shadow-lg transition-shadow cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <ShoppingCart className="h-6 w-6 text-green-600" />
                <h3 className="font-semibold">{t('viewOrders')}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('manageCustomerOrders')}</p>
              <Button variant="outline" size="sm">
                {t('viewOrders')}
              </Button>
            </div>
          </Link>
          
          <Link href="/seller/profile">
            <div className="bg-white p-6 rounded-lg border hover:shadow-lg transition-shadow cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <Users className="h-6 w-6 text-purple-600" />
                <h3 className="font-semibold">{t('updateProfile')}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('editShopInfo')}</p>
              <Button variant="outline" size="sm">
                {t('editProfile')}
              </Button>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Orders */}
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">{t('recentOrders')}</h2>
              <Link href="/seller/orders">
                <Button variant="outline" size="sm">{t('viewAll')}</Button>
              </Link>
            </div>

            {recentOrders.length > 0 ? (
              <div className="space-y-4">
                {recentOrders.map((order: OrderWithItems) => (
                  <div key={order.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">#{order.id.slice(-8)}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatPrice(order.totalToman)}</div>
                      <Badge variant={order.status === 'PENDING' ? 'secondary' : 'default'}>
                        {t(`status_${order.status.toLowerCase()}`)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">{t('noOrders')}</p>
            )}
          </div>

          {/* Recent Products */}
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">{t('recentProducts')}</h2>
              <div className="flex gap-2">
                <Link href="/seller/products/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    {t('addProduct')}
                  </Button>
                </Link>
                <Link href="/seller/products">
                  <Button variant="outline" size="sm">{t('viewAll')}</Button>
                </Link>
              </div>
            </div>

            {recentProducts.length > 0 ? (
              <div className="space-y-4">
                {recentProducts.map((product: ProductWithRelations) => (
                  <div key={product.id} className="flex items-center gap-3 p-3 border rounded">
                    <div className="relative w-12 h-12 rounded overflow-hidden bg-gray-100">
                      <Image
                        src={product.images[0]?.url || '/placeholder-product.jpg'}
                        alt={product.title}
                        width={48}
                        height={48}
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{product.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPrice(product.priceToman)} • {product.stock} {t('inStock')}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/product/${product.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/seller/products/${product.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">{t('noProducts')}</p>
                <Link href="/seller/products/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('addFirstProduct')}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}