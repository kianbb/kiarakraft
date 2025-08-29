import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createReviewSchema = z.object({
  productId: z.string(),
  orderId: z.string(),
  rating: z.number().min(1).max(5),
  title: z.string().max(100).optional(),
  body: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createReviewSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const {
      productId,
      orderId,
      rating,
      title,
      body: reviewBody,
    } = validation.data;

    // Verify the user owns this order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: session.user.id,
        status: 'DELIVERED', // Only delivered orders can be reviewed
      },
      include: {
        items: {
          where: { productId },
        },
      },
    });

    if (!order || order.items.length === 0) {
      return NextResponse.json(
        { error: 'Order not found or not eligible for review' },
        { status: 404 }
      );
    }

    // Check if review already exists
    const existingReview = await prisma.review.findUnique({
      where: {
        productId_userId: {
          productId,
          userId: session.user.id,
        },
      },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'Review already exists for this product' },
        { status: 409 }
      );
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        productId,
        userId: session.user.id,
        rating,
        title: title || null,
        body: reviewBody || null,
        status: 'PENDING', // Reviews start as pending
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get reviews for admin moderation
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    const reviews = await prisma.review.findMany({
      where: { status },
      include: {
        user: {
          select: { name: true, email: true },
        },
        product: {
          select: { title: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit + 1, // Get one extra to check if there are more pages
    });

    const hasNext = reviews.length > limit;
    const reviewsToReturn = hasNext ? reviews.slice(0, limit) : reviews;

    const totalCount = await prisma.review.count({
      where: { status },
    });

    return NextResponse.json({
      reviews: reviewsToReturn,
      pagination: {
        page,
        limit,
        hasNext,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
