import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Export user data for privacy compliance (GDPR Article 20)
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Data export requested for user:', session.user.id);

    // Fetch all user data
    const [user, addresses, orders, reviews, wishlist, returns, sellerProfile] =
      await Promise.all([
        // Basic user info
        db.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        // User addresses
        db.address.findMany({
          where: { userId: session.user.id },
        }),

        // Order history
        db.order.findMany({
          where: { userId: session.user.id },
          include: {
            items: {
              include: {
                product: {
                  select: { title: true, slug: true },
                },
              },
            },
            shipping: true,
          },
        }),

        // Reviews written
        db.review.findMany({
          where: { userId: session.user.id },
          include: {
            product: {
              select: { title: true, slug: true },
            },
          },
        }),

        // Wishlist items
        db.wishlistItem.findMany({
          where: { userId: session.user.id },
          include: {
            product: {
              select: { title: true, slug: true },
            },
          },
        }),

        // Return requests
        db.returnRequest.findMany({
          where: { userId: session.user.id },
          include: {
            order: {
              select: { id: true },
            },
            orderItem: {
              include: {
                product: {
                  select: { title: true, slug: true },
                },
              },
            },
          },
        }),

        // Seller profile (if applicable)
        session.user.role === 'SELLER'
          ? db.sellerProfile.findUnique({
              where: { userId: session.user.id },
              include: {
                products: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    priceToman: true,
                    stock: true,
                    active: true,
                    createdAt: true,
                  },
                },
              },
            })
          : null,
      ]);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build comprehensive export data
    const exportData = {
      exportInfo: {
        exportedAt: new Date().toISOString(),
        exportedBy: user.email,
        dataScope: 'Complete user data export',
        retentionNotice:
          'This data may be retained according to our privacy policy',
      },
      personalInfo: user,
      addresses: addresses || [],
      orderHistory: {
        orders: orders || [],
        totalOrders: orders?.length || 0,
        totalSpent:
          orders?.reduce((sum, order) => sum + order.totalToman, 0) || 0,
      },
      reviews: {
        reviews: reviews || [],
        totalReviews: reviews?.length || 0,
      },
      wishlist: {
        items: wishlist || [],
        totalItems: wishlist?.length || 0,
      },
      returns: {
        requests: returns || [],
        totalRequests: returns?.length || 0,
      },
      ...(sellerProfile && {
        sellerData: {
          profile: sellerProfile,
          totalProducts: sellerProfile.products?.length || 0,
        },
      }),
    };

    console.log('✅ Data export completed for user:', session.user.id);

    // Set headers for file download
    const headers = {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="kiarakraft-data-export-${Date.now()}.json"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), { headers });
  } catch (error) {
    console.error('❌ Data export failed:', error);
    return NextResponse.json(
      { error: 'Failed to export user data' },
      { status: 500 }
    );
  }
}
