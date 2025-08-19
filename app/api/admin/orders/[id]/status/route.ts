import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nextStatusForAdmin, type OrderStatus, type AdminAction } from '@/lib/orderStatus';

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

  const nextStatus = nextStatusForAdmin(order.status as OrderStatus, action as AdminAction);
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
