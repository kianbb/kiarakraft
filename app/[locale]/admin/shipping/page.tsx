'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Truck,
  Package,
  CheckCircle,
  RefreshCw,
  Search,
  Edit,
} from 'lucide-react';

interface ShippingRecord {
  id: string;
  method: string;
  status: string;
  priceToman: number;
  trackingNo: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    totalToman: number;
    user: {
      email: string;
      name: string | null;
    };
    address: {
      fullName: string;
      city: string;
      province: string;
    };
    items: Array<{
      quantity: number;
      product: {
        title: string;
      };
    }>;
  };
}

interface ShippingResponse {
  shippingRecords: ShippingRecord[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function AdminShippingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);
  const _t = useTranslations('admin');
  const t = isHydrated ? _t : (((k: string) => k) as (k: string) => string);

  const [shippingData, setShippingData] = useState<ShippingResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingShipping, setEditingShipping] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    status: '',
    trackingNo: '',
    notes: '',
  });

  const fetchShippingRecords = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });

      if (statusFilter) params.append('status', statusFilter);
      if (methodFilter) params.append('method', methodFilter);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/admin/shipping?${params}`);
      if (response.ok) {
        const data = await response.json();
        setShippingData(data);
      }
    } catch (error) {
      console.error('Error fetching shipping records:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, methodFilter, searchTerm]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }
    if (session?.user?.role !== 'ADMIN') {
      router.push('/');
      return;
    }
    fetchShippingRecords();
  }, [
    session,
    status,
    router,
    currentPage,
    statusFilter,
    methodFilter,
    fetchShippingRecords,
  ]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchShippingRecords();
  };

  const handleEditShipping = (shipping: ShippingRecord) => {
    setEditingShipping(shipping.id);
    setEditForm({
      status: shipping.status,
      trackingNo: shipping.trackingNo || '',
      notes: '',
    });
  };

  const handleSaveShipping = async () => {
    if (!editingShipping) return;

    try {
      const response = await fetch(`/api/admin/shipping/${editingShipping}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        setEditingShipping(null);
        fetchShippingRecords();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update shipping');
      }
    } catch (error) {
      console.error('Error updating shipping:', error);
      alert('Failed to update shipping');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PROCESSING':
        return (
          <Badge className="bg-yellow-100 text-yellow-800">Processing</Badge>
        );
      case 'SHIPPED':
        return <Badge className="bg-blue-100 text-blue-800">Shipped</Badge>;
      case 'DELIVERED':
        return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
      case 'RETURNED':
        return <Badge className="bg-red-100 text-red-800">Returned</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'STANDARD':
        return <Package className="h-4 w-4" />;
      case 'EXPRESS':
        return <Truck className="h-4 w-4" />;
      case 'PICKUP':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-8">
            <div className="bg-gray-200 h-8 rounded"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-gray-200 h-32 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session || session.user.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">{t('shippingManagement')}</h1>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">{t('search')}</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  placeholder={t('searchPlaceholder')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="outline" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="status">{t('status')}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('allStatuses')}</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="SHIPPED">Shipped</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="RETURNED">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="method">{t('shippingMethod')}</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('allMethods')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('allMethods')}</SelectItem>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="EXPRESS">Express</SelectItem>
                  <SelectItem value="PICKUP">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={fetchShippingRecords} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('refresh')}
              </Button>
            </div>
          </div>
        </div>

        {/* Shipping Records */}
        <div className="space-y-4">
          {shippingData?.shippingRecords.map(shipping => (
            <div key={shipping.id} className="bg-white rounded-lg border p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Order Info */}
                <div className="lg:col-span-3">
                  <div className="font-semibold text-sm text-gray-600">
                    Order #{shipping.order.id.slice(-8)}
                  </div>
                  <div className="font-medium">
                    {shipping.order.address.fullName}
                  </div>
                  <div className="text-sm text-gray-600">
                    {shipping.order.address.city},{' '}
                    {shipping.order.address.province}
                  </div>
                  <div className="text-sm text-gray-600">
                    {shipping.order.user.email}
                  </div>
                </div>

                {/* Items */}
                <div className="lg:col-span-3">
                  <div className="text-sm">
                    {shipping.order.items.map((item, idx) => (
                      <div key={idx} className="truncate">
                        {item.quantity}x {item.product.title}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shipping Info */}
                <div className="lg:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    {getMethodIcon(shipping.method)}
                    <span className="text-sm font-medium">
                      {shipping.method}
                    </span>
                  </div>
                  {getStatusBadge(shipping.status)}
                  {shipping.trackingNo && (
                    <div className="text-xs font-mono mt-1">
                      {shipping.trackingNo}
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="lg:col-span-2">
                  <div className="text-xs text-gray-600">
                    Created: {new Date(shipping.createdAt).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-gray-600">
                    Updated: {new Date(shipping.updatedAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="lg:col-span-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditShipping(shipping)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Edit Form */}
              {editingShipping === shipping.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="edit-status">{t('status')}</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={value =>
                          setEditForm({ ...editForm, status: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PROCESSING">Processing</SelectItem>
                          <SelectItem value="SHIPPED">Shipped</SelectItem>
                          <SelectItem value="DELIVERED">Delivered</SelectItem>
                          <SelectItem value="RETURNED">Returned</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit-tracking">
                        {t('trackingNumber')}
                      </Label>
                      <Input
                        id="edit-tracking"
                        value={editForm.trackingNo}
                        onChange={e =>
                          setEditForm({
                            ...editForm,
                            trackingNo: e.target.value,
                          })
                        }
                        placeholder={t('trackingPlaceholder')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-notes">{t('notes')}</Label>
                      <Input
                        id="edit-notes"
                        value={editForm.notes}
                        onChange={e =>
                          setEditForm({ ...editForm, notes: e.target.value })
                        }
                        placeholder={t('notesPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button onClick={handleSaveShipping}>{t('save')}</Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingShipping(null)}
                    >
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {shippingData && shippingData.pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="outline"
              disabled={!shippingData.pagination.hasPrev}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              {t('previous')}
            </Button>

            <span className="px-4 py-2">
              {t('pageInfo', {
                current: currentPage,
                total: shippingData.pagination.totalPages,
              })}
            </span>

            <Button
              variant="outline"
              disabled={!shippingData.pagination.hasNext}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              {t('next')}
            </Button>
          </div>
        )}

        {shippingData && shippingData.shippingRecords.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">
              {t('noShippingRecords')}
            </h3>
            <p className="text-gray-600">{t('noShippingRecordsDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
