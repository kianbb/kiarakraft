import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';
import { deleteImageFromCloudinary } from '@/lib/cloudinary';
import { withCSRF } from '@/lib/csrf';

export const runtime = 'nodejs';

// Delete a single image by ID if seller owns the product
export const DELETE = withRateLimit(uploadRateLimit, withCSRF(async function(request: NextRequest, { params }: { params: { id: string, imageId: string } }) {
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
  // Best-effort delete from Cloudinary
  const cloudDeleted = await deleteImageFromCloudinary(image.url);
  return NextResponse.json({ success: true, cloudDeleted });
  } catch (error) {
    console.error('Delete image error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}));

// Update image alt text
export const PATCH = withRateLimit(uploadRateLimit, withCSRF(async function(request: NextRequest, { params }: { params: { id: string, imageId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { sellerProfile: true } });
    if (!user || user.role !== 'SELLER' || !user.sellerProfile) return NextResponse.json({ error: 'Seller profile required' }, { status: 403 });

    const productId = params.id;
    const imageId = params.imageId;
    const { alt } = await request.json().catch(() => ({ alt: '' }));
    const trimmed = (alt || '').trim();
    if (trimmed.length > 200) return NextResponse.json({ error: 'Alt text too long (max 200 chars)' }, { status: 400 });

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sellerId: true } });
    if (!product || product.sellerId !== user.sellerProfile.id) return NextResponse.json({ error: 'Product not found or not owned by seller' }, { status: 404 });

    const image = await prisma.listingImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== productId) return NextResponse.json({ error: 'Image not found' }, { status: 404 });

    await prisma.listingImage.update({ where: { id: imageId }, data: { alt: trimmed || null } });
    return NextResponse.json({ success: true, alt: trimmed });
  } catch (error) {
    console.error('Update image alt error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}));
