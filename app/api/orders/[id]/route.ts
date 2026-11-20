import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publicProductSelect } from '@/lib/public-product';
import {
  buyerShippingSelect,
  orderReceiptSelect,
  toBuyerShipping,
} from '@/lib/order-read';

export async function GET(
  request: NextRequest,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      select: {
        ...orderReceiptSelect,
        address: true,
        shipping: { select: buyerShippingSelect },
        items: {
          include: {
            product: {
              select: publicProductSelect,
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { shipping, ...receipt } = order;
    return NextResponse.json(
      { ...receipt, shipping: toBuyerShipping(shipping) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}
