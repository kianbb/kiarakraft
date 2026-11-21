import type { Prisma } from '@prisma/client';

export const orderReceiptSelect = {
  id: true,
  userId: true,
  addressId: true,
  status: true,
  totalToman: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

export const buyerShippingSelect = {
  method: true,
  priceToman: true,
  status: true,
  trackingNo: true,
  history: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderShippingSelect;

type BuyerShippingRecord = Prisma.OrderShippingGetPayload<{
  select: typeof buyerShippingSelect;
}>;

interface ShippingTimelineEvent {
  status: string;
  timestamp: string;
  trackingNo?: string;
}

const timelineStatuses = new Set([
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
]);

function projectShippingHistory(history: Prisma.JsonValue) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) {
    return null;
  }
  if (!Array.isArray(history.events)) return null;

  const events: ShippingTimelineEvent[] = [];
  for (const event of history.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (event.kind === 'metadata') continue;
    const { status, timestamp, trackingNo } = event;
    if (typeof status !== 'string' || !timelineStatuses.has(status)) continue;
    if (typeof timestamp !== 'string') continue;
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time)) continue;
    const publicEvent: ShippingTimelineEvent = {
      status,
      timestamp: new Date(time).toISOString(),
    };
    if (typeof trackingNo === 'string' && trackingNo) {
      publicEvent.trackingNo = trackingNo;
    }
    events.push(publicEvent);
  }

  return events.length ? { events } : null;
}

export function toBuyerShipping(shipping: BuyerShippingRecord | null) {
  if (!shipping) return null;
  return {
    method: shipping.method,
    priceToman: shipping.priceToman,
    status: shipping.status,
    trackingNo: shipping.trackingNo,
    history: projectShippingHistory(shipping.history),
    createdAt: shipping.createdAt.toISOString(),
    updatedAt: shipping.updatedAt.toISOString(),
  };
}

export type BuyerShipping = NonNullable<ReturnType<typeof toBuyerShipping>>;

export function buyerShippingTimeline(
  shipping: BuyerShipping,
  order: { status: string; updatedAt: string }
) {
  const timeline = [...(shipping.history?.events ?? [])];

  // The shipment row's updatedAt is also changed by tracking edits. Use the
  // order's timestamp only for a matching legacy state with no recorded event.
  if (
    order.status === shipping.status &&
    order.status !== 'PROCESSING' &&
    timelineStatuses.has(order.status) &&
    !timeline.some(event => event.status === order.status)
  ) {
    timeline.push({
      status: order.status,
      timestamp: order.updatedAt,
      trackingNo: shipping.trackingNo ?? undefined,
    });
  }

  // Catch-up can create a shipment after delivery was already confirmed.
  const createdAt = Date.parse(shipping.createdAt);
  if (
    !timeline.some(event => event.status === 'PROCESSING') &&
    timeline.every(event => createdAt <= Date.parse(event.timestamp))
  ) {
    timeline.push({ status: 'PROCESSING', timestamp: shipping.createdAt });
  }

  return timeline.sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
}

export const sellerOrderSelect = {
  id: true,
  status: true,
  createdAt: true,
  address: {
    select: {
      fullName: true,
      phone: true,
      line1: true,
      line2: true,
      city: true,
      province: true,
      postal: true,
    },
  },
  items: {
    select: {
      id: true,
      unitPriceToman: true,
      quantity: true,
      product: {
        select: {
          title: true,
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type SellerOrderRecord = Prisma.OrderGetPayload<{
  select: typeof sellerOrderSelect;
}>;

const sellerDeliveryStatuses = new Set([
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
]);

export function toSellerOrder(order: SellerOrderRecord) {
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    address: sellerDeliveryStatuses.has(order.status) ? order.address : null,
    items: order.items,
  };
}

export type SellerOrder = Omit<
  ReturnType<typeof toSellerOrder>,
  'createdAt'
> & {
  createdAt: string;
};
