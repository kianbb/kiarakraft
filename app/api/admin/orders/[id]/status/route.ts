import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import {
  nextStatusForAdmin,
  type OrderStatus,
  type AdminAction,
} from '@/lib/orderStatus';
import * as Sentry from '@sentry/nextjs';
import { sendFulfillmentNotification } from '@/lib/notifications';
import { FulfillmentConflict, updateOrderFulfillment } from '@/lib/fulfillment';

// Admin can set status to SHIPPED, DELIVERED, or CANCELED, with guards
export const PATCH = withRateLimit(
  adminRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params: routeParams }: { params: Promise<{ id: string }> }
  ) {
    const params = await routeParams;
    try {
      const session = await auth();
      if (!session?.user?.email || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      Sentry.setUser({ email: session.user.email });

      const { id } = params;
      const body = await request.json().catch(() => ({}));
      const action =
        typeof body?.action === 'string' ? body.action.toLowerCase() : null;

      if (
        !action ||
        !['mark_shipped', 'mark_delivered', 'cancel'].includes(action)
      ) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      const order = await prisma.order.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const nextStatus = nextStatusForAdmin(
        order.status as OrderStatus,
        action as AdminAction
      );
      if (!nextStatus) {
        return NextResponse.json(
          { error: 'Unsupported transition' },
          { status: 400 }
        );
      }

      const updated = await updateOrderFulfillment(
        prisma,
        order,
        nextStatus,
        'ADMIN'
      );
      if (updated.notification) {
        sendFulfillmentNotification(
          updated.order,
          updated.notification,
          updated.shipment?.trackingNo
        );
      }

      return NextResponse.json({
        ...updated.order,
        user: order.user,
        shipping: updated.shipment,
      });
    } catch (error) {
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
          { error: 'Order status changed; refresh and retry' },
          { status: 409 }
        );
      }
      console.error('Error updating order status (admin):', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      );
    }
  })
);
