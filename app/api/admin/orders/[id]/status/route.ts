import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Admin can set status to SHIPPED, DELIVERED, or CANCELED, with guards
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const action = (body?.action as string | undefined)?.toLowerCase();

    if (!action || !['mark_shipped', 'mark_delivered', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    let nextStatus: 'SHIPPED' | 'DELIVERED' | 'CANCELED' | null = null;
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
    } else if (action === 'cancel') {
      if (!['PENDING', 'PAID'].includes(order.status)) {
        return NextResponse.json(
          { error: `Only PENDING or PAID orders can be canceled; current=${order.status}` },
          { status: 400 }
        );
      }
      nextStatus = 'CANCELED';
    }

    if (!nextStatus) {
      return NextResponse.json({ error: 'Unsupported transition' }, { status: 400 });
    }

    const updated = await prisma.order.update({ where: { id }, data: { status: nextStatus } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating order status (admin):', error);
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
  }
}
