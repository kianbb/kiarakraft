import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Allowed transitions for sellers (whole-order level only when the order is single-seller)
// - PAID -> SHIPPED
// - SHIPPED -> DELIVERED
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const action = (body?.action as string | undefined)?.toLowerCase();

    if (!action || !['mark_shipped', 'mark_delivered'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Load order with items and products to verify seller ownership and current status
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { select: { sellerId: true } } }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Determine if this is a single-seller order and that seller is the current user
    const sellerIds = new Set(order.items.map((it) => it.product.sellerId));

    if (sellerIds.size !== 1 || !sellerIds.has(user.id)) {
      return NextResponse.json(
        { error: 'Multi-seller order or not your order; only admin can change overall status' },
        { status: 403 }
      );
    }

    // Enforce allowed transitions
    let nextStatus: 'SHIPPED' | 'DELIVERED' | null = null;
    if (action === 'mark_shipped') {
      if (order.status !== 'PAID') {
        return NextResponse.json(
          { error: `Order must be PAID to mark shipped; current=${order.status}` },
          { status: 400 }
        );
      }
      nextStatus = 'SHIPPED';
    } else if (action === 'mark_delivered') {
      if (order.status !== 'SHIPPED') {
        return NextResponse.json(
          { error: `Order must be SHIPPED to mark delivered; current=${order.status}` },
          { status: 400 }
        );
      }
      nextStatus = 'DELIVERED';
    }

    if (!nextStatus) {
      return NextResponse.json({ error: 'Unsupported transition' }, { status: 400 });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: nextStatus }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating order status (seller):', error);
    return NextResponse.json(
      { error: 'Failed to update order status' },
      { status: 500 }
    );
  }
}
