import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied - Admin required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      prisma.sellerProfile.findMany({
        include: {
          user: {
            select: {
              email: true,
              name: true,
            }
          }
        },
        orderBy: [
          { verified: 'asc' }, // Unverified first
          { createdAt: 'desc' }
        ],
        skip: offset,
        take: limit
      }),
      prisma.sellerProfile.count()
    ]);

    const stats = {
      total,
      pending: await prisma.sellerProfile.count({ where: { verified: false } }),
      verified: await prisma.sellerProfile.count({ where: { verified: true } }),
    };

    return NextResponse.json({
      sellers,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching sellers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sellers' },
      { status: 500 }
    );
  }
}