'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';
import { CheckCircle, XCircle, Clock, AlertCircle, Eye } from 'lucide-react';

type Payment = {
  id: string;
  gateway: string;
  status: string;
  amountToman: number;
  authority?: string;
  refId?: string;
  createdAt: string;
  order: {
    id: string;
    status: string;
    user: { email: string; name?: string };
    items: Array<{ product: { title: string } }>;
  };
};

type PaymentsResponse = {
  payments: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export default function AdminPaymentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('admin');
  const t = isHydrated ? _t : ((k: string) => k) as (k: string) => string;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/admin/payments?${params}`);
      if (response.ok) {
        const data: PaymentsResponse = await response.json();
        setPayments(data.payments);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    if (!session) return;
    
    if (session.user?.role !== 'ADMIN') {
      router.push('/');
      return;
    }
    
    fetchPayments();
  }, [session, statusFilter, page, router, fetchPayments]);

  const markAsPaid = async (paymentId: string) => {
    const reason = prompt('Please provide a reason for marking this payment as paid (minimum 10 characters):');
    
    if (!reason) return;
    
    if (reason.trim().length < 10) {
      alert('Reason must be at least 10 characters long');
      return;
    }
    
    if (!confirm(`Confirm marking payment as paid?\nReason: ${reason}`)) return;
    
    setUpdating(paymentId);
    try {
      const response = await fetch('/api/admin/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          action: 'mark_paid',
          reason: reason.trim()
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || 'Payment marked as paid successfully');
        fetchPayments(); // Refresh the list
      } else {
        const error = await response.json();
        alert(error.error || t('updateFailed'));
      }
    } catch (error) {
      console.error('Error updating payment:', error);
      alert(t('updateFailed'));
    } finally {
      setUpdating(null);
    }
  };

  const handleOrderAction = async (orderId: string, action: 'mark_shipped' | 'mark_delivered' | 'cancel') => {
    if (action === 'cancel') {
      const confirmCancel = confirm(t('confirmCancelOrder'));
      if (!confirmCancel) return;
    }
    try {
      setUpdating(orderId);
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!res.ok) {
        type ErrShape = { error?: string } | undefined;
        const e: ErrShape = await res.json().catch(() => undefined);
        alert(e?.error || t('updateFailed'));
        return;
      }
      fetchPayments();
    } catch (err) {
      console.error('Order status update failed', err);
      alert(t('updateFailed'));
    } finally {
      setUpdating(null);
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'FAILED':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'INITIATED':
        return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Initiated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getGatewayBadge = (gateway: string) => {
    switch (gateway) {
      case 'OFFLINE':
        return <Badge variant="outline">Offline/Manual</Badge>;
      case 'ZARINPAL':
        return <Badge className="bg-blue-100 text-blue-800">Zarinpal</Badge>;
      case 'IDPAY':
        return <Badge className="bg-purple-100 text-purple-800">IDPay</Badge>;
      default:
        return <Badge variant="outline">{gateway}</Badge>;
    }
  };

  if (!session || session.user?.role !== 'ADMIN') {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="bg-gray-200 h-8 rounded w-64"></div>
            <div className="bg-gray-200 h-10 rounded w-48"></div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-16 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">{t('paymentsManagement')}</h1>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('filterByStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatuses')}</SelectItem>
              <SelectItem value="INITIATED">{t('initiated')}</SelectItem>
              <SelectItem value="PENDING">{t('pending')}</SelectItem>
              <SelectItem value="PAID">{t('paid')}</SelectItem>
              <SelectItem value="FAILED">{t('failed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          {payments.map((payment) => (
            <div key={payment.id} className="border rounded-lg p-6 bg-white">
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">Order #{payment.order.id}</h3>
                    {getPaymentStatusBadge(payment.status)}
                    {getGatewayBadge(payment.gateway)}
                    <Badge variant="outline">{t('orderStatus')}: {payment.order.status}</Badge>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p>Customer: {payment.order.user.name || payment.order.user.email}</p>
                    <p>Amount: {formatPrice(payment.amountToman)}</p>
                    <p>Created: {new Date(payment.createdAt).toLocaleString()}</p>
                    {payment.authority && <p>Authority: {payment.authority}</p>}
                    {payment.refId && <p>Ref ID: {payment.refId}</p>}
                  </div>

                  <div className="text-sm">
                    <p className="font-medium">Items:</p>
                    <ul className="list-disc list-inside ml-2">
                      {payment.order.items.map((item, index) => (
                        <li key={index}>{item.product.title}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/order/${payment.order.id}`)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {t('viewOrder')}
                  </Button>

                  {payment.gateway === 'OFFLINE' && payment.status !== 'PAID' && (
                    <Button
                      size="sm"
                      onClick={() => markAsPaid(payment.id)}
                      disabled={updating === payment.id}
                    >
                      {updating === payment.id ? t('updating') : t('markAsPaid')}
                    </Button>
                  )}

                  {payment.order.status === 'PENDING' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleOrderAction(payment.order.id, 'cancel')}
                      disabled={updating === payment.order.id}
                    >
                      {t('cancelOrder')}
                    </Button>
                  )}

                  {payment.order.status === 'PAID' && (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleOrderAction(payment.order.id, 'cancel')}
                        disabled={updating === payment.order.id}
                      >
                        {t('cancelOrder')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOrderAction(payment.order.id, 'mark_shipped')}
                        disabled={updating === payment.order.id}
                      >
                        {t('markShipped')}
                      </Button>
                    </>
                  )}

                  {payment.order.status === 'SHIPPED' && (
                    <Button
                      size="sm"
                      onClick={() => handleOrderAction(payment.order.id, 'mark_delivered')}
                      disabled={updating === payment.order.id}
                    >
                      {t('markDelivered')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {payments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('noPayments')}</p>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              {t('previous')}
            </Button>
            
            <span className="flex items-center px-4">
              {t('pageOf', { current: page, total: pagination.pages })}
            </span>
            
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
            >
              {t('next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}