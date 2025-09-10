import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/shipping - Get all shipping records with filters
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const method = searchParams.get('method');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '20')),
      100
    );
    const search = searchParams.get('search');

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (method) {
      where.method = method;
    }

    if (search) {
      where.OR = [
        {
          trackingNo: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          order: {
            id: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          order: {
            user: {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    // Get total count for pagination
    const totalCount = await prisma.orderShipping.count({ where });

    // Get shipping records
    const shippingRecords = await prisma.orderShipping.findMany({
      where,
      include: {
        order: {
          include: {
            user: {
              select: { email: true, name: true },
            },
            address: {
              select: { fullName: true, city: true, province: true },
            },
            items: {
              select: {
                quantity: true,
                product: {
                  select: { title: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      shippingRecords,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching shipping records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
