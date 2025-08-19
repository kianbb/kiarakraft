import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { adapter } from '@/lib/payments';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, paymentRateLimit } from '@/lib/rateLimit';
import { collectPreflightIssues } from '@/lib/orderPreflight';
import { cancelOrderAndRestoreCart } from '@/lib/paymentsPreflight';
import { parseOrderId } from '@/lib/validation';

export const POST = withRateLimit(paymentRateLimit, withCSRF(async function(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
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
        status: 'PENDING'
      }
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found or not pending' }, { status: 404 });
    }

    // Preflight: re-check stock and product activity before initiating payment
    const items = await prisma.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { id: true, title: true, stock: true, active: true } } }
    });

    const insufficient = collectPreflightIssues(
      items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        product: { title: it.product?.title || 'Unknown', stock: it.product?.stock ?? 0, active: it.product?.active ?? false }
      }))
    );

    if (insufficient.length > 0) {
      // If preflight fails, auto-cancel the pending order and restore the user's cart
      const flags = await prisma.$transaction(async (tx) =>
        cancelOrderAndRestoreCart(
          tx as unknown as import('@/lib/paymentsPreflight').MinimalTx,
          user.id,
          orderId,
          items.map((it) => ({ productId: it.productId, quantity: it.quantity }))
        )
      );

      return NextResponse.json(
        {
          error: 'insufficient_stock',
          details: insufficient,
          ...flags
        },
        { status: 409 }
      );
    }

    // Check if payment already exists and the order is still pending
    const [existingPayment, freshOrder] = await Promise.all([
      prisma.payment.findUnique({ where: { orderId } }),
      prisma.order.findUnique({ where: { id: orderId } })
    ]);

    if (existingPayment) {
      return NextResponse.json({ error: 'Payment already exists for this order' }, { status: 400 });
    }

    if (!freshOrder || freshOrder.status !== 'PENDING') {
      return NextResponse.json({ error: 'Order no longer pending' }, { status: 409 });
    }

  // Build callback URL with allowlist validation
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const requestHost = requestUrl.host;
  const envBase = process.env.PUBLIC_APP_BASE?.replace(/\/$/, '') || '';
  let chosenBase = requestOrigin;
  if (envBase) {
    try {
      const envUrl = new URL(envBase);
      const allowedHosts = (process.env.ALLOWED_APP_BASE_HOSTS || requestHost)
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      if (allowedHosts.includes(envUrl.host)) {
        chosenBase = envUrl.origin;
      }
    } catch {
      // ignore malformed env base, fallback to request origin
    }
  }
  const callbackUrl = `${chosenBase}/api/payments/callback`;

    // Create payment in adapter
    const result = await adapter.create({
      orderId,
      amountToman: order.totalToman,
      callbackUrl
    });

    // Save payment record
    await prisma.payment.create({
      data: {
        orderId,
        gateway: adapter.gateway,
        status: 'INITIATED',
        amountToman: order.totalToman,
        authority: result.authority || null
      }
    });

    // Validate redirect URL is http/https to prevent scheme injection
    try {
      const r = new URL(result.redirectUrl);
      if (r.protocol !== 'http:' && r.protocol !== 'https:') {
        throw new Error('Invalid redirect URL scheme');
      }
    } catch (e) {
      console.error('Unsafe redirect URL from adapter.create', e);
      return NextResponse.json(
        { error: 'Invalid redirect URL from payment gateway' },
        { status: 500 }
      );
    }

    return NextResponse.json({ redirectUrl: result.redirectUrl });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}));