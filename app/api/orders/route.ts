import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, orderRateLimit } from '@/lib/rateLimit';
import { withCSRF } from '@/lib/csrf';

export const POST = withRateLimit(orderRateLimit, withCSRF(async function(request: NextRequest) {
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

    const { shippingInfo } = await request.json();

    // Normalize shipping fields from client (address vs address1)
    const normalized = {
      fullName: shippingInfo?.fullName?.toString().trim() || '',
      phone: shippingInfo?.phone?.toString().trim() || '',
      address1: (shippingInfo?.address1 ?? shippingInfo?.address ?? '').toString().trim(),
      address2: shippingInfo?.address2 ? shippingInfo.address2.toString() : null,
      city: shippingInfo?.city?.toString().trim() || '',
      province: shippingInfo?.province?.toString().trim() || '',
      postalCode: shippingInfo?.postalCode?.toString().trim() || ''
    };

    // Basic validation
    if (!normalized.fullName || !normalized.phone || !normalized.address1 || !normalized.city || !normalized.province || !normalized.postalCode) {
      return NextResponse.json({ error: 'Invalid shipping information' }, { status: 400 });
    }

    // Get cart items with proper typing
    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!cart || cart.items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const cartItems = cart.items;

    // Preflight: collect any issues (inactive or insufficient stock)
    const preflightIssues: Array<{ productId: string; title: string; requested: number; available: number; reason: 'inactive' | 'insufficient_stock' }> = [];
    for (const item of cartItems) {
      const available = item.product.stock ?? 0;
      const isActive = item.product.active;
      if (!isActive) {
        preflightIssues.push({
          productId: item.productId,
          title: item.product.title,
          requested: item.quantity,
          available,
          reason: 'inactive'
        });
      } else if (available < item.quantity) {
        preflightIssues.push({
          productId: item.productId,
          title: item.product.title,
          requested: item.quantity,
          available,
          reason: 'insufficient_stock'
        });
      }
    }

    if (preflightIssues.length > 0) {
      return NextResponse.json(
        { error: 'insufficient_stock', details: preflightIssues },
        { status: 409 }
      );
    }

    // Calculate totals using correct price field
    const subtotal = cartItems.reduce((total, item) => {
      return total + (item.product.priceToman * item.quantity);
    }, 0);
    
    const shippingCost = 50000; // Fixed shipping
    const total = subtotal + shippingCost;

    // Create order in a transaction without decrementing stock yet.
    // Stock is decremented only upon successful payment (gateway callback or admin mark-paid),
    // which prevents double-decrement and keeps inventory consistent on failed payments.
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          userId: user.id,
          status: 'PENDING',
          totalToman: total,
      fullName: normalized.fullName,
      phone: normalized.phone,
      address1: normalized.address1,
      address2: normalized.address2,
      city: normalized.city,
      province: normalized.province,
      postalCode: normalized.postalCode
        }
      });

      // Create order items and reduce stock
      for (const item of cartItems) {
        // Create order item
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceToman: item.product.priceToman
          }
        });
      }


      // Clear cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id }
      });

      return newOrder;
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}));