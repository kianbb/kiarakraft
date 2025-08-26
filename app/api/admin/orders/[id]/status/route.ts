import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import {
  nextStatusForAdmin,
  type OrderStatus,
  type AdminAction,
} from '@/lib/orderStatus';
import * as Sentry from '@sentry/nextjs';
import { sendNotification } from '@/lib/notifications';

// Admin can set status to SHIPPED, DELIVERED, or CANCELED, with guards
export const PATCH = withRateLimit(
  adminRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      Sentry.setUser({ email: session.user.email });

      const { id } = params;
      const body = await request.json().catch(() => ({}));
      const action = (body?.action as string | undefined)?.toLowerCase();

      if (
        !action ||
        !['mark_shipped', 'mark_delivered', 'cancel'].includes(action)
      ) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      const order = await prisma.order.findUnique({ where: { id } });
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

      const updated = await prisma.order.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          user: { select: { id: true, email: true } },
          shipping: true,
        },
      });

      // Send notification for shipped/delivered orders (best-effort)
      if (nextStatus === 'SHIPPED' || nextStatus === 'DELIVERED') {
        setImmediate(async () => {
          try {
            const notificationType =
              nextStatus === 'SHIPPED' ? 'order_shipped' : 'order_delivered';
            await sendNotification({
              userId: updated.user.id,
              type: notificationType,
              data: {
                orderId: updated.id,
                trackingNumber: updated.shipping?.trackingNo || undefined,
                locale: 'fa',
              },
            });
          } catch (notificationError) {
            console.error(
              `Error sending ${nextStatus.toLowerCase()} notification:`,
              notificationError
            );
            Sentry.captureException(notificationError);
          }
        });
      }

      return NextResponse.json(updated);
    } catch (error) {
      console.error('Error updating order status (admin):', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      );
    }
  })
);
