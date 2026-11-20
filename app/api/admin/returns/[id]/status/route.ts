import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { withCSRF } from '@/lib/csrf';
import { JsonInputError, readJsonInput } from '@/lib/json-input';

const updateStatusSchema = z.strictObject({
  status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED']),
  expectedStatus: z
    .enum(['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED'])
    .optional(),
});

const transitions: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED', 'REJECTED'],
};

export const PATCH = withCSRF(async function (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status, expectedStatus } = await readJsonInput(
      request,
      updateStatusSchema,
      1024
    );
    if (status === 'REFUNDED') {
      // Refunds require a verified transfer and a reconciliation record.
      // A return status update cannot provide either.
      return NextResponse.json(
        { error: 'Refund processing is unavailable' },
        { status: 409 }
      );
    }
    if (!expectedStatus) {
      return NextResponse.json(
        { error: 'Expected return status is required' },
        { status: 400 }
      );
    }

    const { id } = await params;
    const current = await prisma.returnRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        userId: true,
        orderId: true,
        orderItem: { select: { product: { select: { title: true } } } },
      },
    });
    if (!current) {
      return NextResponse.json(
        { error: 'Return request not found' },
        { status: 404 }
      );
    }
    if (current.status !== expectedStatus) {
      return NextResponse.json(
        { error: 'Return status changed; refresh and retry' },
        { status: 409 }
      );
    }
    if (!transitions[current.status]?.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid return status transition' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.returnRequest.update({
        where: { id, status: expectedStatus },
        data: { status },
      });
      await tx.notificationLog.create({
        data: {
          userId: current.userId,
          type: `return_${status.toLowerCase()}`,
          channel: 'email',
          status: 'pending',
          data: {
            returnId: current.id,
            orderId: current.orderId,
            productTitle: current.orderItem.product.title,
          },
        },
      });
      return changed;
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof JsonInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'P2025' || error.code === 'P2034')
    ) {
      return NextResponse.json(
        { error: 'Return status changed; refresh and retry' },
        { status: 409 }
      );
    }
    console.error('Failed to update return status');
    return NextResponse.json(
      { error: 'Failed to update return status' },
      { status: 500 }
    );
  }
});
