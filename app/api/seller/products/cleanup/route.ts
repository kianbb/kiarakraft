import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// This endpoint helps clean up products that may have incorrect sellerId
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json(
        { error: 'Seller profile not found' },
        { status: 404 }
      );
    }

    // Find all products that might belong to this seller
    // Check both by sellerProfile.id and by user.id (in case of old bug)
    const productsWithCorrectSellerId = await prisma.product.findMany({
      where: { sellerId: user.sellerProfile.id },
      select: { id: true, title: true },
    });

    const productsWithIncorrectSellerId = await prisma.product.findMany({
      where: { sellerId: user.id },
      select: { id: true, title: true, sellerId: true },
    });

    let fixedCount = 0;
    const fixed = [];

    // Fix products that have user.id as sellerId
    for (const product of productsWithIncorrectSellerId) {
      await prisma.product.update({
        where: { id: product.id },
        data: { sellerId: user.sellerProfile!.id },
      });
      fixed.push(product);
      fixedCount++;
    }

    return NextResponse.json({
      message: 'Cleanup completed',
      stats: {
        correctProducts: productsWithCorrectSellerId.length,
        fixedProducts: fixedCount,
        totalProducts: productsWithCorrectSellerId.length + fixedCount,
      },
      fixed: fixed,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup products' },
      { status: 500 }
    );
  }
}

// Delete all unverified seller's test products
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json(
        { error: 'Seller profile not found' },
        { status: 404 }
      );
    }

    // Only allow deletion of all products if seller is NOT verified
    // This is a safety measure for test sellers
    if (user.sellerProfile.verified) {
      return NextResponse.json(
        { error: 'Verified sellers cannot use bulk delete' },
        { status: 403 }
      );
    }

    // Delete all products for this seller (both correct and incorrect sellerId)
    const deleteCorrect = prisma.product.deleteMany({
      where: { sellerId: user.sellerProfile.id },
    });

    const deleteIncorrect = prisma.product.deleteMany({
      where: { sellerId: user.id },
    });

    const [result1, result2] = await prisma.$transaction([
      deleteCorrect,
      deleteIncorrect,
    ]);

    return NextResponse.json({
      message: 'All products deleted',
      deletedCount: result1.count + result2.count,
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete products' },
      { status: 500 }
    );
  }
}
