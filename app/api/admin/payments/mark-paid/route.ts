import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';
import { parseOrderId } from '@/lib/validation';
import { sendNotification } from '@/lib/notifications';
import { decrementOrderableStock } from '@/lib/orderStock';
import {
  claimOfflinePaymentOrder,
  OfflinePaymentOrderConflict,
} from '@/lib/offline-payment-order';

export const dynamic = 'force-dynamic';

export const POST = withRateLimit(
  adminRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await auth();
      if (!session?.user?.role || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { orderId: rawOrderId } = await request.json();
      const orderId = parseOrderId(rawOrderId);

      const payment = await prisma.payment.findUnique({
        where: { orderId },
      });
      if (!payment) {
        return NextResponse.json(
          { error: 'Payment not found' },
          { status: 404 }
        );
      }

      if (payment.gateway !== 'OFFLINE') {
        return NextResponse.json(
          { error: 'Only OFFLINE payments can be manually marked as paid' },
          { status: 400 }
        );
      }

      if (payment.status === 'PAID') {
        return NextResponse.json({ ok: true, already: true });
      }

      const captured = await prisma.$transaction(
        async tx => {
          // Lock to prevent races
          await tx.$queryRaw`SELECT id, status FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
          const fresh = await tx.payment.findUnique({
            where: { id: payment.id },
          });
          if (
            !fresh ||
            fresh.gateway !== 'OFFLINE' ||
            fresh.orderId !== orderId
          ) {
            throw new OfflinePaymentOrderConflict();
          }
          if (fresh.status === 'PAID') return false;
          if (
            fresh.status !== 'INITIATED' &&
            fresh.status !== 'PENDING' &&
            fresh.status !== 'FAILED'
          ) {
            throw new OfflinePaymentOrderConflict();
          }

          await claimOfflinePaymentOrder(tx, fresh);
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'PAID',
              refId: `OFFLINE-MANUAL-${Date.now()}`,
              raw: {
                manual: true,
                markedBy: session.user.email ?? 'admin',
                at: new Date().toISOString(),
              },
            },
          });

          // Decrement stock atomically per item
          const items = await tx.orderItem.findMany({
            where: { orderId: fresh.orderId },
          });
          await decrementOrderableStock(tx, items);
          return true;
        },
        { isolationLevel: 'Serializable' }
      );

      if (!captured) return NextResponse.json({ ok: true, already: true });

      // Send notification (best-effort)
      setImmediate(async () => {
        try {
          const orderForNotification = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
              user: { select: { id: true, email: true } },
            },
          });

          if (orderForNotification) {
            await sendNotification({
              userId: orderForNotification.user.id,
              type: 'order_paid',
              data: {
                orderId: orderForNotification.id,
                locale: 'fa',
              },
            });
          }
        } catch (notificationError) {
          console.error(
            'Error sending order paid notification (admin):',
            notificationError
          );
          Sentry.captureException(notificationError);
        }
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      if (
        error instanceof OfflinePaymentOrderConflict ||
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2034')
      ) {
        return NextResponse.json(
          {
            error: 'Order or payment changed. Refresh and verify the payment.',
          },
          { status: 409 }
        );
      }
      console.error('Admin mark-paid error:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to mark as paid' },
        { status: 500 }
      );
    }
  })
);
