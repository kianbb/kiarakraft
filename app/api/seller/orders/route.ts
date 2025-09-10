import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam
      ? Math.min(Math.max(1, parseInt(limitParam)), 100)
      : 50;

    const orders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            product: {
              sellerId: user.id,
            },
          },
        },
      },
      include: {
        user: true,
        address: true,
        shipping: true,
        items: {
          where: {
            product: {
              sellerId: user.id,
            },
          },
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Error fetching seller orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
