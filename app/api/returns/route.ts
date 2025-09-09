import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const createReturnSchema = z.object({
  orderId: z.string().min(1).max(50),
  orderItemId: z.string().min(1).max(50),
  reason: z
    .string()
    .min(10)
    .max(1000)
    .transform(val => {
      // HTML entity encode to prevent any XSS - this is safer than trying to strip patterns
      const htmlEntities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;',
      };

      return val.replace(/[&<>"'`=\/]/g, char => htmlEntities[char]);
    }),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const orderId = searchParams.get('orderId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '10')),
      50
    );
    const skip = (page - 1) * limit;

    const where: Prisma.ReturnRequestWhereInput = {};

    // For regular users, only show their own returns
    if (session.user.role !== 'ADMIN') {
      where.userId = session.user.id;
    }

    if (
      status &&
      ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED'].includes(
        status
      )
    ) {
      where.status = status as Prisma.EnumReturnStatusFilter;
    }

    if (orderId) {
      where.orderId = orderId;
    }

    const [returns, total] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              status: true,
              totalToman: true,
            },
          },
          orderItem: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  images: {
                    take: 1,
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit + 1,
      }),
      prisma.returnRequest.count({ where }),
    ]);

    const hasNext = returns.length > limit;
    const data = hasNext ? returns.slice(0, limit) : returns;

    return NextResponse.json({
      returns: data,
      pagination: {
        page,
        limit,
        hasNext,
        total,
      },
    });
  } catch (error) {
    console.error('Error fetching returns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch returns' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createReturnSchema.parse(body);

    // Verify the order and item belong to the user
    const order = await prisma.order.findFirst({
      where: {
        id: validatedData.orderId,
        userId: session.user.id,
      },
      include: {
        items: true,
        payment: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if order is eligible for return
    if (order.payment?.status !== 'PAID') {
      return NextResponse.json(
        { error: 'Order must be paid to request return' },
        { status: 400 }
      );
    }

    // Check if order was delivered
    if (order.status !== 'DELIVERED') {
      return NextResponse.json(
        { error: 'Order must be delivered to request return' },
        { status: 400 }
      );
    }

    // Check return time window (30 days)
    const deliveryDate = order.updatedAt; // Assuming updatedAt is when status changed to DELIVERED
    const daysSinceDelivery = Math.floor(
      (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const RETURN_WINDOW_DAYS = 30;

    if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
      return NextResponse.json(
        { error: `Return window of ${RETURN_WINDOW_DAYS} days has expired` },
        { status: 400 }
      );
    }

    // Verify the item belongs to this order
    const orderItem = order.items.find(
      item => item.id === validatedData.orderItemId
    );

    if (!orderItem) {
      return NextResponse.json(
        { error: 'Order item not found' },
        { status: 404 }
      );
    }

    // Check if return already exists for this item
    const existingReturn = await prisma.returnRequest.findUnique({
      where: { orderItemId: validatedData.orderItemId },
    });

    if (existingReturn) {
      return NextResponse.json(
        { error: 'Return request already exists for this item' },
        { status: 400 }
      );
    }

    // Create the return request
    const returnRequest = await prisma.returnRequest.create({
      data: {
        orderId: validatedData.orderId,
        orderItemId: validatedData.orderItemId,
        userId: session.user.id,
        reason: validatedData.reason,
        status: 'REQUESTED',
      },
    });

    return NextResponse.json(returnRequest, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating return request:', error);
    return NextResponse.json(
      { error: 'Failed to create return request' },
      { status: 500 }
    );
  }
}
