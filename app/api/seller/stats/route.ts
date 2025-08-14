import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get seller statistics
    const [totalProducts, totalOrders, revenue] = await Promise.all([
      prisma.product.count({
        where: { sellerId: user.id }
      }),
      prisma.orderItem.count({
        where: {
          product: {
            sellerId: user.id
          }
        }
      }),
      prisma.orderItem.aggregate({
        where: {
          product: {
            sellerId: user.id
          },
          order: {
            status: { not: 'CANCELLED' }
          }
        },
        _sum: {
          unitPriceToman: true
        }
      })
    ]);

    const stats = {
      totalProducts,
      totalOrders,
      totalRevenue: revenue._sum?.unitPriceToman || 0,
      averageRating: '4.8' // Placeholder - would calculate from reviews
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching seller stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}