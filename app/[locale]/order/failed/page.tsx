'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

function OrderFailedContent() {
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('order');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;

  const orderId = searchParams.get('orderId');
  const reason = searchParams.get('reason');

  const getErrorMessage = (reason: string | null) => {
    switch (reason) {
      case 'manual':
        return t('paymentPendingManual');
      case 'verification_failed':
        return t('paymentVerificationFailed');
      case 'payment_not_found':
        return t('paymentNotFound');
      case 'callback_error':
        return t('paymentCallbackError');
      default:
        return t('paymentFailed');
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 text-center">
        <div className="max-w-md mx-auto">
          <XCircle className="h-20 w-20 mx-auto mb-6 text-red-500" />
          
          <h1 className="text-3xl font-bold mb-4 text-red-700">
            {reason === 'manual' ? t('paymentPending') : t('paymentFailed')}
          </h1>
          
          <p className="text-muted-foreground mb-6">
            {getErrorMessage(reason)}
          </p>
          
          {orderId && (
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-muted-foreground mb-1">
                {t('orderNumber')}
              </p>
              <p className="font-mono font-semibold text-lg">
                {orderId}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {orderId && reason !== 'payment_not_found' && (
              <Link href={`/order/${orderId}`}>
                <Button size="lg" className="w-full">
                  {t('viewOrder')}
                </Button>
              </Link>
            )}
            {reason !== 'manual' && (
              <Link href="/checkout">
                <Button variant="outline" size="lg" className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('retryPayment')}
                </Button>
              </Link>
            )}
            
            <Link href="/explore">
              <Button variant="ghost" size="lg" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('backToShopping')}
              </Button>
            </Link>
          </div>

          {reason === 'manual' && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mt-6">
              <p className="text-sm text-yellow-800">
                {t('offlinePaymentInstructions')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrderFailedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="animate-pulse">
            <div className="bg-gray-200 h-20 w-20 rounded-full mx-auto mb-6"></div>
            <div className="bg-gray-200 h-8 rounded mb-4 max-w-md mx-auto"></div>
            <div className="bg-gray-200 h-4 rounded mb-6 max-w-sm mx-auto"></div>
          </div>
        </div>
      </div>
    }>
      <OrderFailedContent />
    </Suspense>
  );
}