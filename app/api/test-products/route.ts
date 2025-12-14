// Minimal test endpoint to isolate the 500 error
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    console.log('[test-products] Starting...');

    const session = await auth();
    console.log('[test-products] Session:', !!session);

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const products = await prisma.product.findMany({
      where: { sellerId: user.sellerProfile.id },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('[test-products] Found', products.length, 'products');

    return NextResponse.json(products);
  } catch (error) {
    console.error('[test-products] Error:', error);
    return NextResponse.json(
      { error: 'Failed', details: String(error) },
      { status: 500 }
    );
  }
}
