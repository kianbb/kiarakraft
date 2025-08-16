'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/utils';
import { ProductWithRelations } from '@/types/database';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Package,
  ArrowLeft 
} from 'lucide-react';

export default function SellerProductsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const t = isHydrated ? useTranslations('seller') : ((k: string) => k) as any;
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

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

    fetchProducts();
  }, [session, status, router]);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/seller/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm(t('confirmDeleteProduct'))) return;
    
    setDeleting(productId);
    try {
      const response = await fetch(`/api/seller/products/${productId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setProducts(products.filter((p: ProductWithRelations) => p.id !== productId));
      }
    } catch (error) {
      console.error('Error deleting product:', error);
    } finally {
      setDeleting(null);
    }
  };

  const filteredProducts = products.filter((product: ProductWithRelations) =>
    product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-8">
            <div className="bg-gray-200 h-8 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-200 h-64 rounded"></div>
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
              <h1 className="text-3xl font-bold">{t('products')}</h1>
              <p className="text-muted-foreground">{t('manageYourProducts')}</p>
            </div>
            
            <Link href="/seller/products/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('addProduct')}
              </Button>
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder={t('searchProducts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Products Grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product: ProductWithRelations) => (
              <div key={product.id} className="bg-white rounded-lg border overflow-hidden">
                <div className="relative aspect-square">
                  <Image
                    src={product.images[0]?.url || '/placeholder-product.jpg'}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                </div>
                
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold line-clamp-1">{product.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-lg">{formatPrice(product.priceToman)}</div>
                    <div className="flex items-center gap-2">
                      {product.stock > 0 ? (
                        <Badge variant="secondary">{product.stock} {t('inStock')}</Badge>
                      ) : (
                        <Badge variant="destructive">{t('outOfStock')}</Badge>
                      )}
                      {product.active ? (
                        <Badge variant="default">{t('active')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('inactive')}</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Link href={`/product/${product.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye className="h-4 w-4 mr-1" />
                        {t('view')}
                      </Button>
                    </Link>
                    <Link href={`/seller/products/${product.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit className="h-4 w-4 mr-1" />
                        {t('edit')}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteProduct(product.id)}
                      disabled={deleting === product.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-4">
              {searchTerm ? t('noProductsFound') : t('noProducts')}
            </h2>
            <p className="text-muted-foreground mb-6">
              {searchTerm ? t('tryDifferentSearch') : t('addFirstProductDescription')}
            </p>
            {!searchTerm && (
              <Link href="/seller/products/new">
                <Button size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('addFirstProduct')}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}