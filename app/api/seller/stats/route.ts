import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    console.log('[seller/stats GET] Starting request...');
    const session = await auth();
    console.log('[seller/stats GET] Session:', {
      hasSession: !!session,
      email: session?.user?.email,
      role: session?.user?.role,
    });

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      console.log(
        '[seller/stats GET] Unauthorized - missing session or wrong role'
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get seller statistics
    const [totalProducts, totalOrders, revenue] = await Promise.all([
      prisma.product.count({
        where: { sellerId: user.sellerProfile.id },
      }),
      prisma.orderItem.count({
        where: {
          product: {
            sellerId: user.sellerProfile.id,
          },
        },
      }),
      prisma.orderItem.aggregate({
        where: {
          product: {
            sellerId: user.sellerProfile.id,
          },
          order: {
            status: { not: 'CANCELED' },
          },
        },
        _sum: {
          unitPriceToman: true,
        },
      }),
    ]);

    const stats = {
      totalProducts,
      totalOrders,
      totalRevenue: revenue._sum?.unitPriceToman || 0,
      averageRating: '4.8', // Placeholder - would calculate from reviews
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
