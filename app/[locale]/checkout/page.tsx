'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPrice } from '@/lib/utils';
import { CreditCard, MapPin, Package } from 'lucide-react';
import { CartItemWithProduct } from '@/types/database';

const checkoutSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(1, 'Phone is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  paymentMethod: z.enum(['cash_on_delivery', 'bank_transfer'])
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const t = useTranslations('checkout');
  const [cartItems, setCartItems] = useState<CartItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      paymentMethod: 'cash_on_delivery'
    }
  });

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }
    fetchCart();
  }, [session, router]);

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

  const calculateSubtotal = () => {
    return cartItems.reduce((total: number, item: CartItemWithProduct) => {
      return total + (item.product.priceToman * item.quantity);
    }, 0);
  };

  const calculateShipping = () => {
    return 50000; // Fixed shipping cost
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateShipping();
  };

  const onSubmit = async (data: CheckoutForm) => {
    setPlacing(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingInfo: data,
          paymentMethod: data.paymentMethod
        })
      });

      if (response.ok) {
        const order = await response.json();
        router.push(`/order/${order.id}`);
      } else {
        alert(t('orderFailed'));
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert(t('orderFailed'));
    } finally {
      setPlacing(false);
    }
  };

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="bg-gray-200 h-8 rounded mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-gray-200 h-20 rounded"></div>
                ))}
              </div>
              <div className="bg-gray-200 h-64 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4 text-center">
          <Package className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-50" />
          <h1 className="text-2xl font-bold mb-4">{t('emptyCart')}</h1>
          <p className="text-muted-foreground mb-6">{t('emptyCartDescription')}</p>
          <Link href="/explore">
            <Button size="lg">{t('startShopping')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Shipping Information */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5" />
                <h2 className="text-xl font-semibold">{t('shippingInfo')}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fullName">{t('fullName')}</Label>
                  <Input
                    id="fullName"
                    {...register('fullName')}
                    placeholder={t('fullName')}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-destructive mt-1">{errors.fullName.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="phone">{t('phone')}</Label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    placeholder={t('phone')}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="address">{t('address')}</Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder={t('address')}
                />
                {errors.address && (
                  <p className="text-sm text-destructive mt-1">{errors.address.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="city">{t('city')}</Label>
                  <Input
                    id="city"
                    {...register('city')}
                    placeholder={t('city')}
                  />
                  {errors.city && (
                    <p className="text-sm text-destructive mt-1">{errors.city.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="province">{t('province')}</Label>
                  <Input
                    id="province"
                    {...register('province')}
                    placeholder={t('province')}
                  />
                  {errors.province && (
                    <p className="text-sm text-destructive mt-1">{errors.province.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="postalCode">{t('postalCode')}</Label>
                  <Input
                    id="postalCode"
                    {...register('postalCode')}
                    placeholder={t('postalCode')}
                  />
                  {errors.postalCode && (
                    <p className="text-sm text-destructive mt-1">{errors.postalCode.message}</p>
                  )}
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <h2 className="text-xl font-semibold">{t('paymentMethod')}</h2>
                </div>

                <Select
                  value={watch('paymentMethod')}
                  onValueChange={(value) => setValue('paymentMethod', value as 'cash_on_delivery' | 'bank_transfer')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectPaymentMethod')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_on_delivery">{t('cashOnDelivery')}</SelectItem>
                    <SelectItem value="bank_transfer">{t('bankTransfer')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Order Summary */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">{t('orderSummary')}</h2>
              
              {/* Items */}
              <div className="space-y-3">
                {cartItems.map((item: CartItemWithProduct) => (
                  <div key={item.id} className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded overflow-hidden bg-gray-100">
                        <Image
                          src={item.product.images[0]?.url || '/placeholder-product.jpg'}
                          alt={item.product.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{item.product.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('quantity')}: {item.quantity}
                        </div>
                      </div>
                    </div>
                    <div className="font-semibold">
                      {formatPrice(item.product.priceToman * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span>{t('subtotal')}</span>
                  <span>{formatPrice(calculateSubtotal())}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('shipping')}</span>
                  <span>{formatPrice(calculateShipping())}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>{t('total')}</span>
                  <span>{formatPrice(calculateTotal())}</span>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={placing}
              >
                {placing ? t('placing') : t('placeOrder')}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}