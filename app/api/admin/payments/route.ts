import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import { decrementOrderableStock } from '@/lib/orderStock';
import {
  claimOfflinePaymentOrder,
  OfflinePaymentOrderConflict,
} from '@/lib/offline-payment-order';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied - Admin required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '20')),
      100
    );
    const offset = (page - 1) * limit;

    const where = status
      ? {
          status: status as
            | 'INITIATED'
            | 'PENDING'
            | 'PAID'
            | 'FAILED'
            | 'REFUNDED',
        }
      : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          order: {
            include: {
              user: { select: { email: true, name: true } },
              items: {
                include: { product: { select: { title: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

export const PATCH = withRateLimit(
  adminRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await auth();

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user || user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Access denied - Admin required' },
          { status: 403 }
        );
      }

      const body = await request.json();
      const { paymentId, action, reason } = body;

      // Input validation
      if (!paymentId || typeof paymentId !== 'string') {
        return NextResponse.json(
          { error: 'Invalid payment ID' },
          { status: 400 }
        );
      }

      if (!action || typeof action !== 'string') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      if (action === 'mark_paid') {
        // Require reason for manual payment marking
        if (
          !reason ||
          typeof reason !== 'string' ||
          reason.trim().length < 10
        ) {
          return NextResponse.json(
            {
              error:
                'Reason required (minimum 10 characters) for manual payment confirmation',
            },
            { status: 400 }
          );
        }

        // Mark offline payment as paid with enhanced security
        const result = await prisma.$transaction(async tx => {
          // Lock the payment row to avoid races
          await tx.$queryRaw`SELECT id, status FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;

          const payment = await tx.payment.findUnique({
            where: { id: paymentId },
            include: {
              order: {
                include: {
                  user: { select: { email: true } },
                  items: { select: { productId: true, quantity: true } },
                },
              },
            },
          });

          if (!payment) {
            return { error: 'Payment not found', status: 404 };
          }

          if (payment.gateway !== 'OFFLINE') {
            return {
              error: 'Only offline payments can be manually marked as paid',
              status: 400,
            };
          }

          if (payment.status === 'PAID') {
            return { error: 'Payment is already marked as paid', status: 409 };
          }

          // Only allow marking when in expected pre-paid states
          if (payment.status !== 'INITIATED' && payment.status !== 'PENDING') {
            return {
              error: 'Payment is not in a valid state to be marked as paid',
              status: 409,
            };
          }

          // Security check: prevent marking very old payments without additional verification
          const paymentAge = Date.now() - new Date(payment.createdAt).getTime();
          const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days

          if (paymentAge > maxAgeMs) {
            return {
              error:
                'Cannot mark payments older than 30 days without additional verification',
              status: 400,
            };
          }

          // Security check: prevent marking very large amounts without additional verification
          if (payment.amountToman > 50_000_000) {
            // 50M Toman = ~$1000
            return {
              error:
                'Cannot mark payments over 50M Toman without additional verification',
              status: 400,
            };
          }

          await claimOfflinePaymentOrder(tx, payment);

          // Update payment status with detailed audit trail
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: 'PAID',
              refId: `ADMIN-${Date.now()}`,
              raw: {
                adminMarkedPaid: true,
                adminId: user.id,
                adminEmail: user.email,
                reason: reason.trim(),
                markedAt: new Date(),
                orderValue: payment.amountToman,
                customerEmail: payment.order.user.email,
              },
            },
          });

          // Decrement stock atomically for all ordered items (similar to gateway callback)
          await decrementOrderableStock(tx, payment.order.items);

          return { data: { paymentId: payment.id, orderId: payment.orderId } };
        });

        if ('error' in result) {
          return NextResponse.json(
            { error: result.error },
            { status: result.status }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Payment marked as paid successfully',
          data: result.data,
        });
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
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

      console.error('Admin payment confirmation failed');
      return NextResponse.json(
        { error: 'Failed to update payment' },
        { status: 500 }
      );
    }
  })
);
