// Separate route for getting a single seller product to avoid import issues in Next.js 16
// The main /api/seller/products/[id] route has heavy imports for PUT/DELETE that break GET
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const productId = resolvedParams.id;

    console.log('🔍 [API GET] Fetching product:', productId);

    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      console.log('❌ [API GET] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      console.log('❌ [API GET] User or seller profile not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log(
      '✅ [API GET] User authenticated, seller ID:',
      user.sellerProfile.id
    );

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: user.sellerProfile.id,
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        category: true,
      },
    });

    if (!product) {
      console.log('❌ [API GET] Product not found or not owned by seller');
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    console.log('✅ [API GET] Product found:', product.title);
    return NextResponse.json(product, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('❌ [API GET] Error fetching product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
}
