export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED';

export type SellerAction = 'mark_shipped' | 'mark_delivered';
export type AdminAction = SellerAction | 'cancel';

// Returns the next status for a seller-driven action if allowed, otherwise undefined
export function nextStatusForSeller(
  current: OrderStatus,
  action: SellerAction,
  isSingleSellerOrder: boolean
): OrderStatus | undefined {
  if (!isSingleSellerOrder) return undefined;
  if (action === 'mark_shipped' && current === 'PAID') return 'SHIPPED';
  if (action === 'mark_delivered' && current === 'SHIPPED') return 'DELIVERED';
  return undefined;
}

// Returns the next status for an admin action if allowed, otherwise undefined
export function nextStatusForAdmin(
  current: OrderStatus,
  action: AdminAction
): OrderStatus | undefined {
  if (action === 'cancel') {
    if (current === 'PENDING' || current === 'PAID') return 'CANCELED';
    return undefined;
  }
  if (action === 'mark_shipped' && current === 'PAID') return 'SHIPPED';
  if (action === 'mark_delivered' && current === 'SHIPPED') return 'DELIVERED';
  return undefined;
}

export const shippingStatuses = [
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
] as const;
export type ShippingStatus = (typeof shippingStatuses)[number];

export function allowedShippingStatuses(
  orderStatus: string,
  shippingStatus: string
): ShippingStatus[] {
  return shippingStatuses.filter(status => {
    if (status === shippingStatus) return true;
    if (status === 'SHIPPED') {
      return (
        shippingStatus === 'PROCESSING' &&
        (orderStatus === 'PAID' || orderStatus === 'SHIPPED')
      );
    }
    if (status === 'DELIVERED') {
      return (
        (shippingStatus === 'PROCESSING' || shippingStatus === 'SHIPPED') &&
        (orderStatus === 'SHIPPED' || orderStatus === 'DELIVERED')
      );
    }
    return (
      status === 'RETURNED' &&
      ((shippingStatus === 'SHIPPED' && orderStatus === 'SHIPPED') ||
        (shippingStatus === 'DELIVERED' && orderStatus === 'DELIVERED'))
    );
  });
}
