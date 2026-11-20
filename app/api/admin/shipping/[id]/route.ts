import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { sendFulfillmentNotification } from '@/lib/notifications';
import { withCSRF } from '@/lib/csrf';
import { JsonInputError, readJsonInput } from '@/lib/json-input';
import {
  FulfillmentConflict,
  lockFulfillmentOrder,
  writeShipment,
} from '@/lib/fulfillment';
import {
  allowedShippingStatuses,
  nextStatusForAdmin,
  shippingStatuses,
  type OrderStatus,
} from '@/lib/orderStatus';

const updateShippingSchema = z.strictObject({
  status: z.enum(shippingStatuses),
  expectedUpdatedAt: z.iso.datetime(),
  trackingNo: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// PUT /api/admin/shipping/[id] - Update the shipment and its order together.
export const PUT = withCSRF(async function (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { expectedUpdatedAt, ...change } = await readJsonInput(
      request,
      updateShippingSchema,
      8192
    );
    const { id } = await params;
    const record = await prisma.orderShipping.findUnique({
      where: { id },
      select: { orderId: true },
    });
    if (!record) {
      return NextResponse.json(
        { error: 'Shipping record not found' },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async tx => {
      const order = await lockFulfillmentOrder(tx, record.orderId);
      const shipping = await tx.orderShipping.findUnique({ where: { id } });
      if (
        !order ||
        !shipping ||
        shipping.orderId !== order.id ||
        shipping.updatedAt.toISOString() !== expectedUpdatedAt
      ) {
        throw new FulfillmentConflict(
          'Shipping record changed; refresh and retry'
        );
      }
      if (
        !allowedShippingStatuses(order.status, shipping.status).includes(
          change.status
        )
      ) {
        throw new FulfillmentConflict('Unsupported shipping transition');
      }

      const action =
        change.status === 'SHIPPED'
          ? 'mark_shipped'
          : change.status === 'DELIVERED'
            ? 'mark_delivered'
            : undefined;
      const nextStatus =
        action && change.status !== shipping.status
          ? nextStatusForAdmin(order.status as OrderStatus, action)
          : undefined;
      if (nextStatus) {
        await tx.order.update({
          where: { id: order.id, status: order.status },
          data: { status: nextStatus },
        });
      }
      await writeShipment(tx, shipping, { ...change, actor: 'ADMIN' });

      const updated = await tx.orderShipping.findUniqueOrThrow({
        where: { id },
        include: {
          order: {
            include: {
              user: { select: { id: true, email: true, name: true } },
              address: true,
            },
          },
        },
      });
      return { shipping: updated, nextStatus };
    });

    if (result.nextStatus === 'SHIPPED' || result.nextStatus === 'DELIVERED') {
      sendFulfillmentNotification(
        result.shipping.order,
        result.nextStatus,
        result.shipping.trackingNo
      );
    }
    return NextResponse.json({
      message: 'Shipping status updated successfully',
      shipping: result.shipping,
    });
  } catch (error) {
    if (error instanceof JsonInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof FulfillmentConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'P2025' || error.code === 'P2034')
    ) {
      return NextResponse.json(
        { error: 'Shipping record changed; refresh and retry' },
        { status: 409 }
      );
    }
    console.error('Error updating shipping status');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// GET /api/admin/shipping/[id] - Get shipping details
export async function GET(
  _request: NextRequest,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shipping = await prisma.orderShipping.findUnique({
      where: { id: params.id },
      include: {
        order: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
            address: true,
            items: {
              include: {
                product: {
                  select: { title: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    if (!shipping) {
      return NextResponse.json(
        { error: 'Shipping record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(shipping);
  } catch (error) {
    console.error('Error fetching shipping details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
