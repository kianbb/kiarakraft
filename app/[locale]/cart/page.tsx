'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/products/QuantitySelector';
import { formatPrice } from '@/lib/utils';
import { Trash2, ShoppingBag, ArrowLeft } from 'lucide-react';
import { CartItemWithProduct } from '@/types/database';

export default function CartPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const t = useTranslations('cart');
  const [cartItems, setCartItems] = useState<CartItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }
    fetchCart();
  }, [session]);

  const fetchCart = async () => {
    try {
      const response = await fetch('/api/cart');
      if (response.ok) {
        const data = await response.json();
        setCartItems(data);
      }
    } catch (error) {
      console.error('Error fetching cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    setUpdating(itemId);
    try {
      const response = await fetch(`/api/cart/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQuantity })
      });

      if (response.ok) {
        if (newQuantity === 0) {
          setCartItems(cartItems.filter((item) => item.id !== itemId));
        } else {
          const updatedItem = await response.json();
          setCartItems(cartItems.map((item) => 
            item.id === itemId ? updatedItem : item
          ));
        }
      }
    } catch (error) {
      console.error('Error updating cart:', error);
    } finally {
      setUpdating(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setUpdating(itemId);
    try {
      const response = await fetch(`/api/cart/${itemId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setCartItems(cartItems.filter((item) => item.id !== itemId));
      }
    } catch (error) {
      console.error('Error removing item:', error);
    } finally {
      setUpdating(null);
    }
  };

  const calculateTotal = () => {
    return cartItems.reduce((total: number, item: any) => {
      return total + (item.product.priceToman * item.quantity);
    }, 0);
  };

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 p-4 border rounded-lg">
                <div className="bg-gray-200 w-20 h-20 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="bg-gray-200 h-4 rounded"></div>
                  <div className="bg-gray-200 h-4 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <div className="mb-6">
          <Link href="/explore" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t('continueShopping')}
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

        {cartItems.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-4">{t('empty')}</h2>
            <p className="text-muted-foreground mb-6">{t('emptyDescription')}</p>
            <Link href="/explore">
              <Button size="lg">{t('startShopping')}</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex gap-4 p-4 border rounded-lg">
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <Image
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <Link 
                          href={`/product/${item.product.id}`}
                          className="font-semibold hover:text-primary"
                        >
                          {item.product.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {item.product.seller.sellerProfile?.displayName || item.product.seller.name}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        disabled={updating === item.id}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <QuantitySelector
                          value={item.quantity}
                          onChange={(newQuantity) => updateQuantity(item.id, newQuantity)}
                          max={item.product.stock}
                          disabled={updating === item.id}
                        />
                        <span className="text-sm text-muted-foreground">
                          {item.product.stock} {t('available')}
                        </span>
                      </div>
                      <div className="font-semibold">
                        {formatPrice(item.product.priceToman * item.quantity)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="border rounded-lg p-6 sticky top-4">
                <h3 className="text-lg font-semibold mb-4">{t('orderSummary')}</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span>{t('subtotal')}</span>
                    <span>{formatPrice(calculateTotal())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('shipping')}</span>
                    <span>{t('calculateAtCheckout')}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>{t('total')}</span>
                      <span>{formatPrice(calculateTotal())}</span>
                    </div>
                  </div>
                </div>

                <Link href="/checkout">
                  <Button size="lg" className="w-full">
                    {t('proceedToCheckout')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}