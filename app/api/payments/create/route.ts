import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma as realPrisma } from '@/lib/prisma';
import { getOfflinePaymentAdapter } from '@/lib/payments';
import type { PaymentAdapter } from '@/lib/payments/adapter';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, paymentRateLimit } from '@/lib/rateLimit';
import { collectPreflightIssues } from '@/lib/orderPreflight';
import { cancelOrderAndRestoreCart } from '@/lib/paymentsPreflight';
import { parseOrderId } from '@/lib/validation';
import { checkPaymentPatterns } from '@/lib/payment-monitor';
import * as Sentry from '@sentry/nextjs';

// Test overrides (noop in production). Allows injecting fakes in tests.
type TestOverrides = {
  getSession?: typeof auth;
  prisma?: typeof realPrisma;
  adapter?: PaymentAdapter;
};
let __testOverrides: TestOverrides | undefined;
export function __setTestOverrides(overrides?: TestOverrides) {
  __testOverrides = overrides;
}

export const POST = withRateLimit(
  paymentRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const getSession = __testOverrides?.getSession ?? auth;
      const prisma = __testOverrides?.prisma ?? realPrisma;
      const session = await getSession();

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const adapter = __testOverrides?.adapter ?? getOfflinePaymentAdapter();
      if (!adapter || adapter.gateway !== 'OFFLINE') {
        return NextResponse.json(
          { error: 'Configured payment gateway is unavailable' },
          { status: 503 }
        );
      }

      Sentry.setUser({ email: session.user.email });

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const { orderId: rawOrderId } = await request.json();
      const orderId = parseOrderId(rawOrderId);

      // Verify order belongs to user and is in PENDING status
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: user.id,
          status: 'PENDING',
        },
      });

      if (!order) {
        return NextResponse.json(
          { error: 'Order not found or not pending' },
          { status: 404 }
        );
      }

      // Preflight: re-check stock and product activity before initiating payment
      const items = await prisma.orderItem.findMany({
        where: { orderId },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              stock: true,
              active: true,
              isTest: true,
              eligibilityStatus: true,
            },
          },
        },
      });

      const insufficient = collectPreflightIssues(
        items.map(it => ({
          productId: it.productId,
          quantity: it.quantity,
          product: {
            title: it.product?.title || 'Unknown',
            stock: it.product?.stock ?? 0,
            active: it.product?.active ?? false,
            isTest: it.product?.isTest ?? true,
            eligibilityStatus: it.product?.eligibilityStatus ?? 'PENDING',
          },
        }))
      );

      if (insufficient.length > 0) {
        // If preflight fails, auto-cancel the pending order and restore the user's cart
        const flags = await prisma.$transaction(async tx =>
          cancelOrderAndRestoreCart(
            tx as unknown as import('@/lib/paymentsPreflight').MinimalTx,
            user.id,
            orderId,
            items.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
            }))
          )
        );

        return NextResponse.json(
          {
            error: 'insufficient_stock',
            details: insufficient,
            ...flags,
          },
          { status: 409 }
        );
      }

      // Check if payment already exists and the order is still pending
      const [existingPayment, freshOrder] = await Promise.all([
        prisma.payment.findUnique({ where: { orderId } }),
        prisma.order.findUnique({ where: { id: orderId } }),
      ]);

      if (existingPayment) {
        return NextResponse.json(
          { error: 'Payment already exists for this order' },
          { status: 400 }
        );
      }

      if (!freshOrder || freshOrder.status !== 'PENDING') {
        return NextResponse.json(
          { error: 'Order no longer pending' },
          { status: 409 }
        );
      }

      // Keep the buyer's offline callback on the origin holding their session.
      const callbackUrl = '/api/payments/callback';

      // Check for suspicious payment patterns
      const clientIP =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        undefined;

      const patternCheck = await checkPaymentPatterns({
        userId: user.id,
        orderId,
        amount: order.totalToman,
        timestamp: new Date(),
        ip: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      // Log but don't block suspicious payments (monitor mode)
      if (patternCheck.suspicious) {
        console.warn(
          `Suspicious payment pattern detected for user ${user.id}:`,
          patternCheck.activities
        );
        Sentry.captureMessage('Suspicious payment pattern detected', {
          level: 'warning',
          extra: {
            userId: user.id,
            orderId,
            riskScore: patternCheck.riskScore,
            activities: patternCheck.activities,
          },
        });
      }

      // Create payment in adapter
      const result = await adapter.create({
        orderId,
        amountToman: order.totalToman,
        callbackUrl,
      });
      if (!result.redirectUrl.startsWith(callbackUrl + '?')) {
        return NextResponse.json(
          { error: 'Invalid redirect URL from payment gateway' },
          { status: 500 }
        );
      }

      // Save payment record
      await prisma.payment.create({
        data: {
          orderId,
          gateway: adapter.gateway,
          status: 'PENDING',
          amountToman: order.totalToman,
          authority: result.authority || null,
        },
      });

      return NextResponse.json({ redirectUrl: result.redirectUrl });
    } catch (error) {
      console.error('Error creating payment:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to create payment' },
        { status: 500 }
      );
    }
  })
);
