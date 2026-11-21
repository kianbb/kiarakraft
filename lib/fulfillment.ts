import type {
  Order,
  OrderShipping,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { OrderStatus, ShippingStatus } from './orderStatus';

type OrderState = Pick<Order, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
type ShippingChange = {
  status: ShippingStatus;
  actor: 'ADMIN' | 'SELLER';
  trackingNo?: string;
  notes?: string;
  occurredAt?: Date;
  legacyInferred?: boolean;
};

export class FulfillmentConflict extends Error {}

export async function lockFulfillmentOrder(
  tx: Prisma.TransactionClient,
  orderId: string
) {
  // Keep the Order lock through the shipment/history write. Every fulfillment
  // entry point locks in this order, including tracking-only edits.
  const [order] = await tx.$queryRaw<OrderState[]>`
    SELECT "id", "status", "createdAt", "updatedAt" FROM "Order"
    WHERE "id" = ${orderId} FOR UPDATE
  `;
  return order;
}

export function legacyOrderStatusTime(
  order: Pick<Order, 'createdAt' | 'updatedAt'>
) {
  const timestamp = order.updatedAt.getTime();
  if (!(timestamp >= order.createdAt.getTime() && timestamp <= Date.now())) {
    throw new FulfillmentConflict('Order status timestamp needs review');
  }
  return order.updatedAt;
}

export async function writeShipment(
  tx: Prisma.TransactionClient,
  shipping: OrderShipping,
  change: ShippingChange
) {
  const trackingNo = change.trackingNo || shipping.trackingNo;
  if (
    change.status === shipping.status &&
    trackingNo === shipping.trackingNo &&
    !change.notes
  ) {
    return shipping;
  }

  const history = shipping.history ?? {};
  if (
    typeof history !== 'object' ||
    Array.isArray(history) ||
    (history.events !== undefined && !Array.isArray(history.events))
  ) {
    throw new FulfillmentConflict('Shipping history needs review');
  }
  const updatedAt = new Date(
    Math.max(
      Date.now(),
      shipping.updatedAt.getTime() + 1,
      change.occurredAt?.getTime() ?? 0
    )
  );
  const kind =
    change.status === shipping.status
      ? 'metadata'
      : change.legacyInferred
        ? 'legacy-inferred'
        : 'transition';
  return tx.orderShipping.update({
    where: { id: shipping.id },
    data: {
      status: change.status,
      trackingNo,
      updatedAt,
      history: {
        ...history,
        events: [
          ...(history.events ?? []),
          {
            status: change.status,
            timestamp: (change.occurredAt ?? updatedAt).toISOString(),
            kind,
            updatedBy: change.actor,
            ...(change.trackingNo && { trackingNo: change.trackingNo }),
            ...(change.notes && { notes: change.notes }),
          },
        ],
      },
    },
  });
}

export async function updateOrderFulfillment(
  db: Pick<PrismaClient, '$transaction'>,
  observed: Pick<Order, 'id' | 'status'>,
  status: OrderStatus,
  actor: ShippingChange['actor']
) {
  return db.$transaction(async tx => {
    const order = await lockFulfillmentOrder(tx, observed.id);
    if (!order || order.status !== observed.status) {
      throw new FulfillmentConflict('Order status changed; refresh and retry');
    }

    const shipping = await tx.orderShipping.findUnique({
      where: { orderId: order.id },
    });
    const fulfillmentStatus = status === 'SHIPPED' || status === 'DELIVERED';
    if (
      shipping &&
      shipping.status !== 'PROCESSING' &&
      (status === 'CANCELED' || shipping.status !== 'SHIPPED')
    ) {
      // A recorded shipment can rule out cancellation. Legacy delivery ahead
      // of the order needs reconciliation that retains its actual delivery date.
      throw new FulfillmentConflict('Shipping status needs review');
    }

    const updated = await tx.order.update({
      where: { id: order.id, status: order.status },
      data: { status },
    });
    const shipment =
      fulfillmentStatus && shipping
        ? await writeShipment(tx, shipping, {
            status,
            actor,
            occurredAt: updated.updatedAt,
          })
        : shipping;
    return {
      order: updated,
      shipment,
      notification:
        fulfillmentStatus && shipping?.status !== status ? status : null,
    };
  });
}
