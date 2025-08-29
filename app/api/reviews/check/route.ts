import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    // Verify the user owns this order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: session.user.id,
      },
      include: {
        items: {
          select: { productId: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get product IDs from the order
    const productIds = order.items.map(item => item.productId);

    // Check which products the user has already reviewed
    const existingReviews = await prisma.review.findMany({
      where: {
        userId: session.user.id,
        productId: { in: productIds },
      },
      select: { productId: true, status: true },
    });

    return NextResponse.json({
      reviewedProductIds: existingReviews.map(r => r.productId),
      reviews: existingReviews,
    });
  } catch (error) {
    console.error('Error checking reviews:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
