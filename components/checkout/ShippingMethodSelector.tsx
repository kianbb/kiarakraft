'use client';

import { useTranslations } from 'next-intl';
import { Truck, Zap, Package } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

export type ShippingMethod = 'STANDARD' | 'EXPRESS' | 'PICKUP';

interface ShippingOption {
  id: ShippingMethod;
  name: string;
  description: string;
  price: number;
  icon: React.ReactNode;
  estimatedDays: string;
}

interface ShippingMethodSelectorProps {
  selectedMethod?: ShippingMethod;
  onMethodSelect: (method: ShippingMethod, price: number) => void;
}

export function ShippingMethodSelector({
  selectedMethod,
  onMethodSelect,
}: ShippingMethodSelectorProps) {
  const t = useTranslations('checkout');

  const shippingOptions: ShippingOption[] = [
    {
      id: 'STANDARD',
      name: t('standardShipping'),
      description: t('standardShippingDesc'),
      price: 50000, // 50,000 Toman
      icon: <Package className="h-5 w-5" />,
      estimatedDays: t('standardDays'),
    },
    {
      id: 'EXPRESS',
      name: t('expressShipping'),
      description: t('expressShippingDesc'),
      price: 120000, // 120,000 Toman
      icon: <Zap className="h-5 w-5" />,
      estimatedDays: t('expressDays'),
    },
    {
      id: 'PICKUP',
      name: t('pickup'),
      description: t('pickupDesc'),
      price: 0, // Free
      icon: <Truck className="h-5 w-5" />,
      estimatedDays: t('pickupDays'),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5" />
        <h3 className="text-lg font-semibold">{t('shippingMethod')}</h3>
      </div>

      <div className="space-y-3">
        {shippingOptions.map(option => (
          <div
            key={option.id}
            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              selectedMethod === option.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => onMethodSelect(option.id, option.price)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-1 text-gray-600">{option.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{option.name}</span>
                    <span className="text-sm text-gray-500">
                      ({option.estimatedDays})
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  {option.price === 0 ? t('free') : formatPrice(option.price)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedMethod && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 text-blue-800">
            <div className="text-blue-600">
              {shippingOptions.find(opt => opt.id === selectedMethod)?.icon}
            </div>
            <span className="text-sm font-medium">
              {t('selectedShipping')}:{' '}
              {shippingOptions.find(opt => opt.id === selectedMethod)?.name}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
