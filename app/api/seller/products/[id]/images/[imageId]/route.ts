import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

// Delete a single image by ID if seller owns the product
export const DELETE = withRateLimit(uploadRateLimit, async function(request: NextRequest, { params }: { params: { id: string, imageId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { sellerProfile: true } });
    if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
      return NextResponse.json({ error: 'Seller profile required' }, { status: 403 });
    }

    const productId = params.id;
    const imageId = params.imageId;

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sellerId: true } });
    if (!product || product.sellerId !== user.sellerProfile.id) {
      return NextResponse.json({ error: 'Product not found or not owned by seller' }, { status: 404 });
    }

    const image = await prisma.listingImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== productId) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    await prisma.listingImage.delete({ where: { id: imageId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete image error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
});
