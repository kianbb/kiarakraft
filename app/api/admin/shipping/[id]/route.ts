import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { sendNotification } from '@/lib/notifications';

const updateShippingSchema = z.object({
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED']),
  trackingNo: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/admin/shipping/[id] - Update shipping status
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateShippingSchema.parse(body);

    // Find the shipping record
    const existingShipping = await prisma.orderShipping.findUnique({
      where: { id: params.id },
      include: {
        order: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    if (!existingShipping) {
      return NextResponse.json(
        { error: 'Shipping record not found' },
        { status: 404 }
      );
    }

    // Build history entry
    interface HistoryEvent {
      status: string;
      timestamp: Date;
      updatedBy: string;
      trackingNo?: string;
      notes?: string;
    }

    interface HistoryData {
      events: HistoryEvent[];
    }

    const currentHistory =
      (existingShipping.history as unknown as HistoryData) || { events: [] };
    const newEvent: HistoryEvent = {
      status: validatedData.status,
      timestamp: new Date(),
      updatedBy: session.user.email,
      ...(validatedData.trackingNo && { trackingNo: validatedData.trackingNo }),
      ...(validatedData.notes && { notes: validatedData.notes }),
    };

    const updatedHistory: HistoryData = {
      events: [...currentHistory.events, newEvent],
    };

    // Update shipping record
    const updatedShipping = await prisma.orderShipping.update({
      where: { id: params.id },
      data: {
        status: validatedData.status,
        trackingNo: validatedData.trackingNo || existingShipping.trackingNo,
        history: updatedHistory as unknown as Prisma.InputJsonValue,
      },
      include: {
        order: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
            address: true,
          },
        },
      },
    });

    // Send notification for shipping status updates (best-effort)
    if (
      validatedData.status === 'SHIPPED' ||
      validatedData.status === 'DELIVERED'
    ) {
      setImmediate(async () => {
        try {
          const notificationType =
            validatedData.status === 'SHIPPED'
              ? 'order_shipped'
              : 'order_delivered';
          await sendNotification({
            userId: updatedShipping.order.user.id,
            type: notificationType,
            data: {
              orderId: updatedShipping.order.id,
              trackingNumber: updatedShipping.trackingNo || undefined,
              locale: 'fa',
            },
          });
        } catch (notificationError) {
          console.error(
            `Error sending ${validatedData.status.toLowerCase()} notification:`,
            notificationError
          );
        }
      });
    }

    return NextResponse.json({
      message: 'Shipping status updated successfully',
      shipping: updatedShipping,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Error updating shipping status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/admin/shipping/[id] - Get shipping details
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shipping = await prisma.orderShipping.findUnique({
      where: { id: params.id },
      include: {
        order: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
            address: true,
            items: {
              include: {
                product: {
                  select: { title: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    if (!shipping) {
      return NextResponse.json(
        { error: 'Shipping record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(shipping);
  } catch (error) {
    console.error('Error fetching shipping details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
