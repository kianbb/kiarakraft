import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// XSS sanitization helper
const sanitizeText = (text: string): string => {
  return text
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/script/gi, ''); // Remove script tags
};

const createReviewSchema = z.object({
  productId: z.string().max(50),
  orderId: z.string().max(50),
  rating: z.number().min(1).max(5),
  title: z.string().max(100).transform(sanitizeText).optional(),
  body: z.string().max(1000).transform(sanitizeText).optional(),
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
        { error: 'Not found' }, // Generic message to prevent enumeration
        { status: 404 }
      );
    }

    // Check review time window (90 days after delivery)
    const deliveryDate = order.updatedAt; // Assuming updatedAt is when status changed to DELIVERED
    const daysSinceDelivery = Math.floor(
      (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const REVIEW_WINDOW_DAYS = 90;
    
    if (daysSinceDelivery > REVIEW_WINDOW_DAYS) {
      return NextResponse.json(
        { error: `Review window of ${REVIEW_WINDOW_DAYS} days has expired` },
        { status: 400 }
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
