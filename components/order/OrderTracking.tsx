'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Truck, Package, CheckCircle, Clock, MapPin } from 'lucide-react';
import { OrderShipping } from '@/types/database';

interface OrderTrackingProps {
  shipping: OrderShipping;
  locale: string;
}

export function OrderTracking({ shipping, locale }: OrderTrackingProps) {
  const t = useTranslations('order');

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'PROCESSING':
        return {
          icon: <Package className="h-5 w-5" />,
          label: t('processing'),
          color: 'bg-yellow-100 text-yellow-800',
          description: t('processingDesc'),
        };
      case 'SHIPPED':
        return {
          icon: <Truck className="h-5 w-5" />,
          label: t('shipped'),
          color: 'bg-blue-100 text-blue-800',
          description: t('shippedDesc'),
        };
      case 'DELIVERED':
        return {
          icon: <CheckCircle className="h-5 w-5" />,
          label: t('delivered'),
          color: 'bg-green-100 text-green-800',
          description: t('deliveredDesc'),
        };
      case 'RETURNED':
        return {
          icon: <MapPin className="h-5 w-5" />,
          label: t('returned'),
          color: 'bg-red-100 text-red-800',
          description: t('returnedDesc'),
        };
      default:
        return {
          icon: <Clock className="h-5 w-5" />,
          label: status,
          color: 'bg-gray-100 text-gray-800',
          description: '',
        };
    }
  };

  const getShippingMethodName = (method: string) => {
    switch (method) {
      case 'STANDARD':
        return t('standardShipping');
      case 'EXPRESS':
        return t('expressShipping');
      case 'PICKUP':
        return t('pickup');
      default:
        return method;
    }
  };

  const getEstimatedDelivery = () => {
    if (shipping.status === 'DELIVERED') return null;
    if (shipping.method === 'PICKUP') return t('pickupReady');

    const baseDate = new Date(shipping.createdAt);
    let daysToAdd = 0;

    switch (shipping.method) {
      case 'STANDARD':
        daysToAdd = shipping.status === 'SHIPPED' ? 3 : 7;
        break;
      case 'EXPRESS':
        daysToAdd = shipping.status === 'SHIPPED' ? 1 : 3;
        break;
    }

    const estimatedDate = new Date(
      baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000
    );
    return estimatedDate.toLocaleDateString(
      locale === 'fa' ? 'fa-IR' : 'en-US'
    );
  };

  const statusInfo = getStatusInfo(shipping.status);
  const estimatedDelivery = getEstimatedDelivery();

  // Define the timeline event interface
  interface TimelineEvent {
    status: string;
    timestamp: string | Date;
    trackingNo?: string;
    notes?: string;
  }

  // Parse history from JSON if available
  const history = shipping.history as { events?: Array<TimelineEvent> } | null;
  const timeline: TimelineEvent[] = history?.events || [
    {
      status: 'PROCESSING',
      timestamp: shipping.createdAt,
    },
  ];

  // Add current status if not in timeline
  const hasCurrentStatus = timeline.some(
    (event: TimelineEvent) => event.status === shipping.status
  );
  if (!hasCurrentStatus && shipping.status !== 'PROCESSING') {
    timeline.push({
      status: shipping.status,
      timestamp: shipping.updatedAt,
      trackingNo: shipping.trackingNo || undefined,
    });
  }

  // Sort timeline by timestamp
  timeline.sort(
    (a: TimelineEvent, b: TimelineEvent) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="p-4 border rounded-lg bg-gray-50">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-gray-600">{statusInfo.icon}</div>
          <div>
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            <p className="text-sm text-gray-600 mt-1">
              {statusInfo.description}
            </p>
          </div>
        </div>

        {/* Shipping Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
          <div>
            <span className="font-medium">{t('shippingMethod')}:</span>
            <span className="ml-2">
              {getShippingMethodName(shipping.method)}
            </span>
          </div>

          {shipping.trackingNo && (
            <div>
              <span className="font-medium">{t('trackingNumber')}:</span>
              <span className="ml-2 font-mono">{shipping.trackingNo}</span>
            </div>
          )}

          {estimatedDelivery && (
            <div>
              <span className="font-medium">{t('estimatedDelivery')}:</span>
              <span className="ml-2">{estimatedDelivery}</span>
            </div>
          )}

          <div>
            <span className="font-medium">{t('shippingCost')}:</span>
            <span className="ml-2">
              {shipping.priceToman === 0
                ? t('free')
                : `${shipping.priceToman.toLocaleString()} ${t('currency')}`}
            </span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('shippingTimeline')}</h3>
        <div className="space-y-4">
          {timeline.map((event: TimelineEvent, index: number) => {
            const eventStatusInfo = getStatusInfo(event.status);
            const isCompleted =
              index < timeline.length - 1 || shipping.status === event.status;
            const isCurrent =
              shipping.status === event.status && index === timeline.length - 1;

            return (
              <div key={index} className="flex items-start gap-4">
                {/* Timeline dot */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </div>

                {/* Timeline content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-medium ${isCurrent ? 'text-blue-600' : 'text-gray-900'}`}
                    >
                      {eventStatusInfo.label}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        {t('current')}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mb-1">
                    {new Date(event.timestamp).toLocaleDateString(
                      locale === 'fa' ? 'fa-IR' : 'en-US',
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )}
                  </p>

                  {event.trackingNo && (
                    <p className="text-sm text-gray-500">
                      {t('trackingNumber')}:{' '}
                      <span className="font-mono">{event.trackingNo}</span>
                    </p>
                  )}

                  {event.notes && (
                    <p className="text-sm text-gray-600 mt-1">{event.notes}</p>
                  )}
                </div>

                {/* Timeline line */}
                {index < timeline.length - 1 && (
                  <div
                    className={`absolute left-4 top-8 w-0.5 h-16 ${
                      isCompleted ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    style={{ marginLeft: '15px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pickup Instructions */}
      {shipping.method === 'PICKUP' && shipping.status === 'PROCESSING' && (
        <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900">
                {t('pickupInstructions')}
              </h4>
              <p className="text-sm text-blue-800 mt-1">
                {t('pickupInstructionsDesc')}
              </p>
              <p className="text-sm text-blue-700 mt-2 font-mono">
                {t('pickupAddress')}: {t('storeAddress')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
