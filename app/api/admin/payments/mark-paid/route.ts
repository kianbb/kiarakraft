import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';
import { parseOrderId } from '@/lib/validation';
import { sendNotification } from '@/lib/notifications';

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
        include: { order: true },
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

      await prisma.$transaction(
        async tx => {
          // Lock to prevent races
          await tx.$queryRaw`SELECT id, status FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
          const fresh = await tx.payment.findUnique({
            where: { id: payment.id },
          });
          if (!fresh) throw new Error('Payment missing');
          if (fresh.status === 'PAID') return; // idempotent
          if (
            fresh.status !== 'INITIATED' &&
            fresh.status !== 'PENDING' &&
            fresh.status !== 'FAILED'
          ) {
            throw new Error('Invalid state for manual capture');
          }

          // Mark payment and order as PAID
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

          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: 'PAID' },
          });

          // Decrement stock atomically per item
          const items = await tx.orderItem.findMany({
            where: { orderId: payment.orderId },
          });
          for (const item of items) {
            const updated: unknown =
              await tx.$executeRaw`UPDATE "Product" SET stock = stock - ${item.quantity} WHERE id = ${item.productId} AND stock >= ${item.quantity}`;
            if (Number(updated) === 0) {
              throw new Error('Insufficient stock while finalizing order');
            }
          }
        },
        { isolationLevel: 'Serializable' }
      );

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
      console.error('Admin mark-paid error:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to mark as paid' },
        { status: 500 }
      );
    }
  })
);
