import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { adapter } from '@/lib/payments';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, paymentRateLimit } from '@/lib/rateLimit';

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

    const { orderId } = await request.json();

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

    const insufficient: Array<{ productId: string; title: string; requested: number; available: number; reason: string }> = [];
    for (const it of items) {
      const available = it.product?.stock ?? 0;
      const isActive = it.product?.active ?? false;
      if (!isActive) {
        insufficient.push({
          productId: it.productId,
          title: it.product?.title || 'Unknown',
          requested: it.quantity,
          available,
          reason: 'inactive'
        });
      } else if (available < it.quantity) {
        insufficient.push({
          productId: it.productId,
          title: it.product?.title || 'Unknown',
          requested: it.quantity,
          available,
          reason: 'insufficient_stock'
        });
      }
    }

    if (insufficient.length > 0) {
      return NextResponse.json(
        {
          error: 'insufficient_stock',
          details: insufficient
        },
        { status: 409 }
      );
    }

    // Check if payment already exists
    const existingPayment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (existingPayment) {
      return NextResponse.json({ error: 'Payment already exists for this order' }, { status: 400 });
    }

  // Build callback URL using request origin (fallback to env)
  // This prevents leaking "http://localhost:3000" in production when env is missing.
  const requestOrigin = new URL(request.url).origin;
  const baseUrl = (process.env.PUBLIC_APP_BASE?.replace(/\/$/, '')) || requestOrigin;
  const callbackUrl = `${baseUrl}/api/payments/callback`;

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

    return NextResponse.json({ redirectUrl: result.redirectUrl });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}));