'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('order');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  const orderId = searchParams.get('orderId');

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 text-center">
        <div className="max-w-md mx-auto">
          <CheckCircle className="h-20 w-20 mx-auto mb-6 text-green-500" />

          <h1 className="text-3xl font-bold mb-4 text-green-700">
            {t('paymentSuccessful')}
          </h1>

          <p className="text-muted-foreground mb-6">{t('orderConfirmation')}</p>

          {orderId && (
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-muted-foreground mb-1">
                {t('orderNumber')}
              </p>
              <p className="font-mono font-semibold text-lg">{orderId}</p>
            </div>
          )}

          <div className="space-y-3">
            {orderId && (
              <Link href={`/order/${orderId}`}>
                <Button size="lg" className="w-full">
                  <Package className="h-4 w-4 mr-2" />
                  {t('viewOrder')}
                </Button>
              </Link>
            )}

            <Link href="/explore">
              <Button variant="outline" size="lg" className="w-full">
                {t('continueShopping')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>

          <p className="text-sm text-muted-foreground mt-8">
            {t('orderEmailNotification')}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen py-8">
          <div className="container mx-auto px-4 text-center">
            <div className="animate-pulse">
              <div className="bg-gray-200 h-20 w-20 rounded-full mx-auto mb-6"></div>
              <div className="bg-gray-200 h-8 rounded mb-4 max-w-md mx-auto"></div>
              <div className="bg-gray-200 h-4 rounded mb-6 max-w-sm mx-auto"></div>
            </div>
          </div>
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
