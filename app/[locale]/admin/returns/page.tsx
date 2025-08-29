'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  PackageCheck,
  DollarSign,
} from 'lucide-react';
import { formatDate, formatPrice } from '@/lib/utils';

interface ReturnRequest {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  order: {
    id: string;
    status: string;
    totalToman: number;
  };
  orderItem: {
    unitPriceToman: number;
    quantity: number;
    product: {
      id: string;
      title: string;
      images: { url: string }[];
    };
  };
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

export default function AdminReturnsPage({
  params,
}: {
  params: { locale: string };
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations('admin');

  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('REQUESTED');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push(`/${params.locale}/auth/login`);
      return;
    }

    if (session.user?.role !== 'ADMIN') {
      router.push(`/${params.locale}`);
      return;
    }

    const fetchReturns = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/returns?status=${selectedStatus}&page=${currentPage}&limit=10`
        );

        if (response.ok) {
          const data = await response.json();
          setReturns(data.returns);
          setTotalCount(data.pagination.total);
          setHasNext(data.pagination.hasNext);
        } else {
          console.error('Failed to fetch returns');
        }
      } catch (error) {
        console.error('Error fetching returns:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReturns();
  }, [session, status, router, selectedStatus, currentPage, params.locale]);

  const handleStatusUpdate = async (
    returnId: string,
    newStatus: 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED'
  ) => {
    setUpdating(returnId);
    try {
      const response = await fetch(`/api/admin/returns/${returnId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        // Remove from current list if status changed
        setReturns(prev => prev.filter(r => r.id !== returnId));
        setTotalCount(prev => Math.max(0, prev - 1));
        alert(t('returnStatusUpdated'));
      } else {
        const error = await response.json();
        alert(error.message || t('errorUpdatingReturn'));
      }
    } catch (error) {
      console.error('Error updating return status:', error);
      alert(t('errorUpdatingReturn'));
    } finally {
      setUpdating(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      REQUESTED: { label: t('requested'), variant: 'secondary' as const },
      APPROVED: { label: t('approved'), variant: 'default' as const },
      REJECTED: { label: t('rejected'), variant: 'destructive' as const },
      RECEIVED: { label: t('received'), variant: 'outline' as const },
      REFUNDED: { label: t('refunded'), variant: 'default' as const },
    };

    const { label, variant } =
      config[status as keyof typeof config] || config.REQUESTED;
    return <Badge variant={variant}>{label}</Badge>;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('returnsManagement')}</h1>
        <p className="text-muted-foreground">{t('manageReturnRequests')}</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{t('filters')}</h2>
        </div>
        <div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('status')}
              </label>
              <Select
                value={selectedStatus}
                onValueChange={value => {
                  setSelectedStatus(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REQUESTED">{t('requested')}</SelectItem>
                  <SelectItem value="APPROVED">{t('approved')}</SelectItem>
                  <SelectItem value="REJECTED">{t('rejected')}</SelectItem>
                  <SelectItem value="RECEIVED">{t('received')}</SelectItem>
                  <SelectItem value="REFUNDED">{t('refunded')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground pt-6">
              {t('totalReturns', { count: totalCount })}
            </div>
          </div>
        </div>
      </div>

      {/* Returns List */}
      <div className="space-y-4">
        {returns.length === 0 ? (
          <div className="bg-white rounded-lg border p-6 text-center py-12">
            <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">{t('noReturns')}</h2>
            <p className="text-muted-foreground">{t('noReturnsInStatus')}</p>
          </div>
        ) : (
          returns.map(returnRequest => (
            <div key={returnRequest.id} className="bg-white rounded-lg border">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusBadge(returnRequest.status)}
                    <span className="text-sm text-gray-500">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {formatDate(returnRequest.createdAt)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {returnRequest.status === 'REQUESTED' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusUpdate(returnRequest.id, 'APPROVED')
                          }
                          disabled={updating === returnRequest.id}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {t('approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleStatusUpdate(returnRequest.id, 'REJECTED')
                          }
                          disabled={updating === returnRequest.id}
                        >
                          <X className="h-4 w-4 mr-1" />
                          {t('reject')}
                        </Button>
                      </>
                    )}
                    {returnRequest.status === 'APPROVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleStatusUpdate(returnRequest.id, 'RECEIVED')
                        }
                        disabled={updating === returnRequest.id}
                      >
                        <PackageCheck className="h-4 w-4 mr-1" />
                        {t('markReceived')}
                      </Button>
                    )}
                    {returnRequest.status === 'RECEIVED' && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleStatusUpdate(returnRequest.id, 'REFUNDED')
                        }
                        disabled={updating === returnRequest.id}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        {t('processRefund')}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">
                      {t('customer')}
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">
                        {returnRequest.user.name || returnRequest.user.email}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500 mb-1">
                      {t('product')}
                    </div>
                    <div className="font-medium">
                      {returnRequest.orderItem.product.title}
                    </div>
                    <div className="text-sm text-gray-600">
                      {returnRequest.orderItem.quantity} ×{' '}
                      {formatPrice(
                        returnRequest.orderItem.unitPriceToman,
                        params.locale
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500 mb-1">
                      {t('orderId')}
                    </div>
                    <div className="font-mono text-sm">
                      #{returnRequest.order.id.slice(-8)}
                    </div>
                  </div>
                </div>

                {returnRequest.reason && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-sm text-gray-500 mb-1">
                      {t('reason')}
                    </div>
                    <p className="text-sm">{returnRequest.reason}</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {(currentPage > 1 || hasNext) && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t('previous')}
          </Button>

          <span className="text-sm text-gray-600">
            {t('pageOf', {
              current: currentPage,
              total: Math.ceil(totalCount / 10),
            })}
          </span>

          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={!hasNext}
          >
            {t('next')}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
