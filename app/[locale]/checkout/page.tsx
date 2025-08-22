'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPrice } from '@/lib/utils';
import { CreditCard, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { CartItemWithProduct, Address } from '@/types/database';
import { AddressSelector } from '@/components/checkout/AddressSelector';
import {
  ShippingMethodSelector,
  ShippingMethod,
} from '@/components/checkout/ShippingMethodSelector';

export default function CheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('checkout');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  // State
  const [cartItems, setCartItems] = useState<CartItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [placing, setPlacing] = useState(false);

  // Checkout data
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [selectedShippingMethod, setSelectedShippingMethod] =
    useState<ShippingMethod | null>(null);
  const [shippingPrice, setShippingPrice] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    'cash_on_delivery' | 'bank_transfer'
  >('cash_on_delivery');

  const [preflightIssues, setPreflightIssues] = useState<
    Array<{
      productId: string;
      title?: string;
      requested: number;
      available: number;
      reason: 'inactive' | 'insufficient_stock';
    }>
  >([]);

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
      return total + item.product.priceToman * item.quantity;
    }, 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + shippingPrice;
  };

  const handleAddressSelect = (address: Address) => {
    setSelectedAddress(address);
  };

  const handleShippingMethodSelect = (
    method: ShippingMethod,
    price: number
  ) => {
    setSelectedShippingMethod(method);
    setShippingPrice(price);
  };

  const canProceedToStep = (step: number) => {
    switch (step) {
      case 2:
        return selectedAddress !== null;
      case 3:
        return selectedAddress !== null && selectedShippingMethod !== null;
      default:
        return true;
    }
  };

  const handleNextStep = () => {
    if (currentStep < 3 && canProceedToStep(currentStep + 1)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddress || !selectedShippingMethod) {
      alert(t('pleaseCompleteAllSteps'));
      return;
    }

    setPlacing(true);
    setPreflightIssues([]);

    try {
      // Create order first
      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressId: selectedAddress.id,
          shippingMethod: selectedShippingMethod,
          shippingPrice: shippingPrice,
          paymentMethod: paymentMethod,
        }),
      });

      if (!orderResponse.ok) {
        if (orderResponse.status === 409) {
          const err = await orderResponse.json();
          if (Array.isArray(err?.details)) setPreflightIssues(err.details);
          alert(t('paymentPreflightIssues'));
          return;
        }
        alert(t('orderFailed'));
        return;
      }

      const order = await orderResponse.json();

      // Create payment and get redirect URL
      const paymentResponse = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
        }),
      });

      if (paymentResponse.ok) {
        const { redirectUrl } = await paymentResponse.json();
        // Redirect to payment gateway or confirmation page
        window.location.href = redirectUrl;
      } else {
        if (paymentResponse.status === 409) {
          // Stock or activity preflight failed
          const error = await paymentResponse.json();
          if (Array.isArray(error?.details)) {
            setPreflightIssues(error.details);
          }
          alert(t('paymentPreflightIssues'));
          // If server canceled the order and restored the cart, send user to cart to fix
          if (error?.orderCanceled && error?.cartRestored) {
            router.push('/cart');
            return;
          }
          // Otherwise stay on checkout to let user adjust quantities
          return;
        } else {
          const error = await paymentResponse.json();
          alert(error.error || t('paymentFailed'));
          // Fallback to order page if payment creation fails otherwise
          router.push(`/order/${order.id}`);
        }
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
          <p className="text-muted-foreground mb-6">
            {t('emptyCartDescription')}
          </p>
          <Link href="/explore">
            <Button size="lg">{t('startShopping')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const steps = [
    {
      number: 1,
      title: t('shippingAddress'),
      completed: selectedAddress !== null,
    },
    {
      number: 2,
      title: t('shippingMethod'),
      completed: selectedShippingMethod !== null,
    },
    { number: 3, title: t('paymentReview'), completed: false },
  ];

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">{t('checkout')}</h1>

        {preflightIssues.length > 0 && (
          <div className="mb-8 rounded-md border border-red-300 bg-red-50 p-4 text-red-900">
            <p className="font-semibold mb-2">{t('paymentPreflightIssues')}</p>
            <p className="text-sm mb-3 text-red-800">
              {t('paymentPreflightDescription')}
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              {preflightIssues.map((iss, idx) => (
                <li key={idx}>
                  <span className="font-medium">{iss.title || 'Item'}</span>:{' '}
                  {iss.reason === 'inactive'
                    ? t('inactiveProduct')
                    : t('insufficientStockDetail', {
                        available: iss.available,
                        requested: iss.requested,
                      })}
                </li>
              ))}
            </ul>
            <p className="text-sm mt-3">{t('adjustCart')}</p>
            <div className="mt-3">
              <Link href="/cart">
                <Button variant="destructive" size="sm">
                  {t('goToCart')}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      currentStep === step.number
                        ? 'bg-blue-600 text-white'
                        : step.completed
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {step.number}
                  </div>
                  <span className="ml-2 text-sm font-medium text-gray-900">
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 mx-4 text-gray-400" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Checkout Steps */}
          <div className="space-y-8">
            {/* Step 1: Address Selection */}
            {currentStep === 1 && (
              <AddressSelector
                selectedAddressId={selectedAddress?.id}
                onAddressSelect={handleAddressSelect}
              />
            )}

            {/* Step 2: Shipping Method */}
            {currentStep === 2 && (
              <ShippingMethodSelector
                selectedMethod={selectedShippingMethod || undefined}
                onMethodSelect={handleShippingMethodSelect}
              />
            )}

            {/* Step 3: Payment & Review */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">
                    {t('paymentMethod')}
                  </h3>
                </div>

                <Select
                  value={paymentMethod}
                  onValueChange={value =>
                    setPaymentMethod(
                      value as 'cash_on_delivery' | 'bank_transfer'
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectPaymentMethod')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_on_delivery">
                      {t('cashOnDelivery')}
                    </SelectItem>
                    <SelectItem value="bank_transfer">
                      {t('bankTransfer')}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Order Review */}
                <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <h4 className="font-medium">{t('orderReview')}</h4>

                  {selectedAddress && (
                    <div className="text-sm">
                      <p className="font-medium">{t('shippingTo')}:</p>
                      <p>{selectedAddress.fullName}</p>
                      <p>
                        {selectedAddress.line1}
                        {selectedAddress.line2 && `, ${selectedAddress.line2}`}
                      </p>
                      <p>
                        {selectedAddress.city}, {selectedAddress.province}
                      </p>
                    </div>
                  )}

                  {selectedShippingMethod && (
                    <div className="text-sm">
                      <p className="font-medium">{t('shippingMethod')}:</p>
                      <p>
                        {t(`${selectedShippingMethod.toLowerCase()}Shipping`)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={currentStep === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t('previous')}
              </Button>

              {currentStep < 3 ? (
                <Button
                  onClick={handleNextStep}
                  disabled={!canProceedToStep(currentStep + 1)}
                >
                  {t('next')}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handlePlaceOrder}
                  disabled={
                    placing || !selectedAddress || !selectedShippingMethod
                  }
                >
                  {placing ? t('placing') : t('placeOrder')}
                </Button>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:sticky lg:top-8 space-y-6">
            <h2 className="text-xl font-semibold">{t('orderSummary')}</h2>

            {/* Items */}
            <div className="space-y-3">
              {cartItems.map((item: CartItemWithProduct) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded overflow-hidden bg-gray-100">
                      <Image
                        src={
                          item.product.images?.[0]?.url ||
                          '/placeholder-product.jpg'
                        }
                        alt={
                          item.product.images?.[0]?.alt || item.product.title
                        }
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {item.product.title}
                      </div>
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
                <span>
                  {shippingPrice === 0 ? t('free') : formatPrice(shippingPrice)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>{t('total')}</span>
                <span>{formatPrice(calculateTotal())}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
