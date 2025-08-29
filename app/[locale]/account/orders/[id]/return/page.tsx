'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';
import { ArrowLeft, Package } from 'lucide-react';

interface OrderItem {
  id: string;
  unitPriceToman: number;
  quantity: number;
  product: {
    id: string;
    title: string;
    images: { url: string; alt?: string }[];
  };
  returnRequest?: {
    id: string;
    status: string;
    reason?: string;
    createdAt: string;
  };
}

interface Order {
  id: string;
  status: string;
  totalToman: number;
  createdAt: string;
  items: OrderItem[];
  payment?: {
    status: string;
  };
}

export default function ReturnRequestPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations('returns');
  const isRTL = params.locale === 'fa';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push(`/${params.locale}/auth/login`);
      return;
    }

    const fetchOrder = async () => {
      try {
        const response = await fetch(`/api/orders/${params.id}`);
        if (!response.ok) throw new Error('Failed to fetch order');

        const data = await response.json();
        setOrder(data);
      } catch (error) {
        console.error('Error fetching order:', error);
        router.push(`/${params.locale}/account/orders`);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [session, status, params.id, params.locale, router]);

  const handleSubmit = async () => {
    if (!selectedItem || !reason) {
      alert(t('fillAllFields'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: params.id,
          orderItemId: selectedItem,
          reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit return request');
      }

      alert(t('returnRequestSubmitted'));
      router.push(`/${params.locale}/account/orders/${params.id}`);
    } catch (error) {
      console.error('Error submitting return:', error);
      alert(t('errorSubmittingReturn'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Filter out items that already have return requests
  const returnableItems = order.items.filter(item => !item.returnRequest);

  if (returnableItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-white rounded-lg border p-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-2">
              {t('noReturnableItems')}
            </h1>
            <p className="text-muted-foreground">{t('allItemsReturned')}</p>
          </div>
          <div>
            <Button
              onClick={() =>
                router.push(`/${params.locale}/account/orders/${params.id}`)
              }
              variant="outline"
            >
              <ArrowLeft className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
              {t('backToOrder')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Button
        onClick={() =>
          router.push(`/${params.locale}/account/orders/${params.id}`)
        }
        variant="ghost"
        className="mb-6"
      >
        <ArrowLeft className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
        {t('backToOrder')}
      </Button>

      <div className="bg-white rounded-lg border p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-2">{t('requestReturn')}</h1>
          <p className="text-muted-foreground">{t('returnPolicy')}</p>
        </div>
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('selectItem')}
            </label>
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger>
                <SelectValue placeholder={t('chooseItem')} />
              </SelectTrigger>
              <SelectContent>
                {returnableItems.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>{item.product.title}</span>
                      <Badge variant="secondary">
                        {item.quantity} ×{' '}
                        {formatPrice(item.unitPriceToman, params.locale)}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('reasonForReturn')}
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedItem || !reason}
              className="flex-1"
            >
              {submitting ? t('submitting') : t('submitRequest')}
            </Button>
            <Button
              onClick={() =>
                router.push(`/${params.locale}/account/orders/${params.id}`)
              }
              variant="outline"
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
