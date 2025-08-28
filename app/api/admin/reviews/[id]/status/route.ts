import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import { sendNotification } from '@/lib/notifications';
import * as Sentry from '@sentry/nextjs';

export const PATCH = withRateLimit(
  adminRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const session = await auth();
      if (!session?.user?.email || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { id } = params;
      const body = await request.json().catch(() => ({}));
      const { status } = body;

      if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }

      const review = await prisma.review.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true } },
          product: { select: { id: true, title: true } },
        },
      });

      if (!review) {
        return NextResponse.json(
          { error: 'Review not found' },
          { status: 404 }
        );
      }

      if (review.status === status) {
        return NextResponse.json({ message: 'Status already set' });
      }

      // Update review status
      const updated = await prisma.review.update({
        where: { id },
        data: {
          status,
          updatedAt: new Date(),
        },
        include: {
          user: { select: { id: true, email: true } },
          product: { select: { id: true, title: true } },
        },
      });

      // If approved, update product rating aggregates
      if (status === 'APPROVED') {
        const productReviews = await prisma.review.findMany({
          where: {
            productId: review.productId,
            status: 'APPROVED',
          },
          select: { rating: true },
        });

        const totalRating = productReviews.reduce(
          (sum, r) => sum + r.rating,
          0
        );
        const avgRating =
          productReviews.length > 0 ? totalRating / productReviews.length : 0;

        await prisma.product.update({
          where: { id: review.productId },
          data: {
            ratingAvg: avgRating,
            ratingCount: productReviews.length,
          },
        });

        // Send approval notification (best-effort)
        setImmediate(async () => {
          try {
            await sendNotification({
              userId: updated.user.id,
              type: 'review_approved',
              data: {
                productTitle: updated.product.title,
                reviewTitle: updated.title || 'Your review',
                locale: 'fa',
              },
            });
          } catch (notificationError) {
            console.error(
              'Error sending review approved notification:',
              notificationError
            );
            Sentry.captureException(notificationError);
          }
        });
      }

      return NextResponse.json(updated);
    } catch (error) {
      console.error('Error updating review status (admin):', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to update review status' },
        { status: 500 }
      );
    }
  })
);
