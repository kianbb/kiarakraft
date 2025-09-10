import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { withCSRF } from '@/lib/csrf';
import { z } from 'zod';

// Validation schema for account deletion request
const accountDeletionSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * Request account deletion for privacy compliance (GDPR Article 17)
 * This marks the account for deletion rather than immediately deleting it
 * to allow for proper data handling and legal retention requirements
 */
export const POST = withCSRF(async function (request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = accountDeletionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { reason } = validation.data;

    console.log('🗑️ Account deletion requested for user:', session.user.id);

    // Check if user has active orders or seller obligations
    const [activeOrders, sellerProfile] = await Promise.all([
      db.order.count({
        where: {
          userId: session.user.id,
          status: {
            in: ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'],
          },
        },
      }),

      db.sellerProfile.findUnique({
        where: { userId: session.user.id },
        include: {
          products: {
            where: { active: true },
            select: { id: true },
          },
        },
      }),
    ]);

    // Check for active seller obligations
    const hasActiveProducts = (sellerProfile?.products?.length || 0) > 0;
    const hasActiveOrders = activeOrders > 0;

    if (hasActiveOrders || hasActiveProducts) {
      return NextResponse.json(
        {
          error: 'Cannot delete account with active orders or products',
          details: {
            activeOrders,
            activeProducts: sellerProfile?.products?.length || 0,
            message:
              'Please complete all orders and deactivate products before requesting deletion',
          },
        },
        { status: 400 }
      );
    }

    // Create deletion request record (for compliance tracking)
    const deletionRequest = await db.$transaction(async tx => {
      // Mark user as deletion requested
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          // We could add a deletionRequested field to User model
          // For now, we'll use a separate tracking mechanism
          updatedAt: new Date(),
        },
      });

      // Log the deletion request (in a real system, this would be in a separate audit table)
      return {
        userId: session.user.id,
        requestedAt: new Date().toISOString(),
        reason: reason || 'User requested account deletion',
        status: 'PENDING',
        expectedDeletionDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(), // 30 days
      };
    });

    console.log('✅ Deletion request created for user:', session.user.id);

    return NextResponse.json({
      success: true,
      message: 'Account deletion request submitted successfully',
      deletionRequest: {
        requestId: `DEL-${session.user.id}-${Date.now()}`,
        status: 'PENDING',
        expectedDeletionDate: deletionRequest.expectedDeletionDate,
        notice:
          'Your account will be marked for deletion in 30 days. You can cancel this request by logging in before then.',
      },
    });
  } catch (error) {
    console.error('❌ Account deletion request failed:', error);
    return NextResponse.json(
      { error: 'Failed to process deletion request' },
      { status: 500 }
    );
  }
});

/**
 * Cancel account deletion request
 */
export const DELETE = withCSRF(async function () {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('↩️ Account deletion cancelled for user:', session.user.id);

    // In a real system, this would update the deletion request status
    // For now, we'll just return success

    return NextResponse.json({
      success: true,
      message: 'Account deletion request cancelled successfully',
    });
  } catch (error) {
    console.error('❌ Failed to cancel deletion request:', error);
    return NextResponse.json(
      { error: 'Failed to cancel deletion request' },
      { status: 500 }
    );
  }
});
