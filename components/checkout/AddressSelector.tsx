'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, MapPin } from 'lucide-react';
import { Address } from '@/types/database';

interface AddressSelectorProps {
  selectedAddressId?: string;
  onAddressSelect: (address: Address) => void;
}

export function AddressSelector({
  selectedAddressId,
  onAddressSelect,
}: AddressSelectorProps) {
  const t = useTranslations('checkout');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    country: 'IR',
    province: '',
    city: '',
    line1: '',
    line2: '',
    postal: '',
    isDefault: false,
  });

  const fetchAddresses = useCallback(async () => {
    try {
      const response = await fetch('/api/addresses');
      if (response.ok) {
        const data = await response.json();
        setAddresses(data);
        // Auto-select default address if none selected
        if (!selectedAddressId && data.length > 0) {
          const defaultAddress =
            data.find((addr: Address) => addr.isDefault) || data[0];
          onAddressSelect(defaultAddress);
        }
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedAddressId, onAddressSelect]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingAddress
        ? `/api/addresses/${editingAddress.id}`
        : '/api/addresses';
      const method = editingAddress ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const address = await response.json();
        await fetchAddresses();
        setShowForm(false);
        setEditingAddress(null);
        resetForm();

        // Auto-select the new/updated address
        onAddressSelect(address);
      }
    } catch (error) {
      console.error('Error saving address:', error);
    }
  };

  const handleEdit = (address: Address) => {
    setEditingAddress(address);
    setFormData({
      fullName: address.fullName,
      phone: address.phone,
      country: address.country,
      province: address.province,
      city: address.city,
      line1: address.line1,
      line2: address.line2 || '',
      postal: address.postal || '',
      isDefault: address.isDefault,
    });
    setShowForm(true);
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm(t('confirmDeleteAddress'))) return;

    try {
      const response = await fetch(`/api/addresses/${addressId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchAddresses();
      }
    } catch (error) {
      console.error('Error deleting address:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      phone: '',
      country: 'IR',
      province: '',
      city: '',
      line1: '',
      line2: '',
      postal: '',
      isDefault: false,
    });
  };

  const handleAddNew = () => {
    setEditingAddress(null);
    resetForm();
    setShowForm(true);
  };

  if (loading) {
    return <div className="animate-pulse bg-gray-200 h-32 rounded"></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          <h3 className="text-lg font-semibold">{t('shippingAddress')}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-1" />
          {t('addAddress')}
        </Button>
      </div>

      {/* Address List */}
      {addresses.length > 0 && (
        <div className="space-y-3">
          {addresses.map(address => (
            <div
              key={address.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedAddressId === address.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => onAddressSelect(address)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{address.fullName}</span>
                    {address.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        {t('default')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{address.phone}</p>
                  <p className="text-sm text-gray-600">
                    {address.line1}
                    {address.line2 && `, ${address.line2}`}
                  </p>
                  <p className="text-sm text-gray-600">
                    {address.city}, {address.province}
                    {address.postal && ` ${address.postal}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleEdit(address);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(address.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Address Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 border rounded-lg bg-gray-50 space-y-4"
        >
          <h4 className="font-medium">
            {editingAddress ? t('editAddress') : t('addNewAddress')}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fullName">{t('fullName')}</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={e =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">{t('phone')}</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={e =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="line1">{t('addressLine1')}</Label>
            <Input
              id="line1"
              value={formData.line1}
              onChange={e =>
                setFormData({ ...formData, line1: e.target.value })
              }
              required
            />
          </div>

          <div>
            <Label htmlFor="line2">{t('addressLine2')}</Label>
            <Input
              id="line2"
              value={formData.line2}
              onChange={e =>
                setFormData({ ...formData, line2: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">{t('city')}</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={e =>
                  setFormData({ ...formData, city: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="province">{t('province')}</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={e =>
                  setFormData({ ...formData, province: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="postal">{t('postalCode')}</Label>
              <Input
                id="postal"
                value={formData.postal}
                onChange={e =>
                  setFormData({ ...formData, postal: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={e =>
                setFormData({ ...formData, isDefault: e.target.checked })
              }
            />
            <Label htmlFor="isDefault">{t('setAsDefault')}</Label>
          </div>

          <div className="flex gap-2">
            <Button type="submit">
              {editingAddress ? t('updateAddress') : t('addAddress')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingAddress(null);
                resetForm();
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
