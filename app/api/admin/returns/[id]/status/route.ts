import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { status } = updateStatusSchema.parse(body);

    // Get the return request
    const returnRequest = await prisma.returnRequest.findUnique({
      where: { id: params.id },
      include: {
        orderItem: {
          include: {
            product: true,
          },
        },
        order: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!returnRequest) {
      return NextResponse.json(
        { error: 'Return request not found' },
        { status: 404 }
      );
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      REQUESTED: ['APPROVED', 'REJECTED'],
      APPROVED: ['RECEIVED', 'REJECTED'],
      RECEIVED: ['REFUNDED'],
      REJECTED: [],
      REFUNDED: [],
    };

    if (!validTransitions[returnRequest.status]?.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status transition from ${returnRequest.status} to ${status}`,
        },
        { status: 400 }
      );
    }

    // Handle refund logic
    if (status === 'REFUNDED') {
      // Check if payment exists and is PAID
      if (returnRequest.order.payment?.status !== 'PAID') {
        return NextResponse.json(
          { error: 'Cannot refund unpaid order' },
          { status: 400 }
        );
      }

      // Calculate refund amount
      const refundAmount =
        returnRequest.orderItem.unitPriceToman *
        returnRequest.orderItem.quantity;

      // In production, you would call the payment gateway refund API here
      // For now, we'll just update the payment status
      await prisma.payment.update({
        where: { id: returnRequest.order.payment.id },
        data: {
          status: 'REFUNDED',
          raw: {
            ...((returnRequest.order.payment.raw as Record<string, unknown>) ||
              {}),
            refundedAt: new Date().toISOString(),
            refundAmount,
            refundedBy: session.user.id,
          },
        },
      });

      // Restock the product if configured
      if (process.env.RESTOCK_ON_REFUND === 'true') {
        await prisma.product.update({
          where: { id: returnRequest.orderItem.productId },
          data: {
            stock: {
              increment: returnRequest.orderItem.quantity,
            },
          },
        });
      }
    }

    // Update the return request status
    const updated = await prisma.returnRequest.update({
      where: { id: params.id },
      data: { status },
    });

    // Log notification (in production, send actual notifications)
    await prisma.notificationLog.create({
      data: {
        userId: returnRequest.userId,
        type: `return_${status.toLowerCase()}`,
        channel: 'email',
        status: 'pending',
        data: {
          returnId: returnRequest.id,
          orderId: returnRequest.orderId,
          productTitle: returnRequest.orderItem.product.title,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid status', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating return status:', error);
    return NextResponse.json(
      { error: 'Failed to update return status' },
      { status: 500 }
    );
  }
}
