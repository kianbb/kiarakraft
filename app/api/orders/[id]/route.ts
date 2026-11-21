import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publicProductSelect } from '@/lib/public-product';
import { returnIneligibility } from '@/lib/return-eligibility';
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
        payment: { select: { status: true } },
        shipping: { select: buyerShippingSelect },
        items: {
          include: {
            returnRequest: { select: { id: true } },
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

    const { shipping, payment, items, ...receipt } = order;
    const ineligibility = returnIneligibility({
      ...receipt,
      payment,
      shipping,
    });
    const returnEligible = ineligibility === null;
    return NextResponse.json(
      {
        ...receipt,
        shipping: toBuyerShipping(shipping),
        returnEligible,
        returnNeedsSupport: ineligibility === 'delivery_unconfirmed',
        items: items.map(({ returnRequest, ...item }) => ({
          ...item,
          returnEligible: returnEligible && !returnRequest,
        })),
      },
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
