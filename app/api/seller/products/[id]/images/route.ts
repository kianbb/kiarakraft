import {
  ImageOrderError,
  reorderProductImages,
} from '@/lib/product-image-order';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { withCSRF } from '@/lib/csrf';
import { isStagingDeployment } from '@/lib/deployment-policy';
import {
  ProductImageInputError,
  readImageMultipart,
  readProductImage,
} from '@/lib/product-image-input';

const MAX_BATCH_FILES = 5;

export const runtime = 'nodejs';

const limitedUpload = withRateLimit(
  uploadRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
  ) {
    try {
      // Handle params as Promise (Next.js 15 change)
      const resolvedParams = await params;
      const productId = resolvedParams.id;

      const session = await auth();
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { sellerProfile: true },
      });
      if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
        return NextResponse.json(
          { error: 'Seller profile required' },
          { status: 403 }
        );
      }
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sellerId: true },
      });
      if (!product || product.sellerId !== user.sellerProfile.id) {
        return NextResponse.json(
          { error: 'Product not found or not owned by seller' },
          { status: 404 }
        );
      }

      const formData = await readImageMultipart(request);
      const files = formData.getAll('files');
      if (files.length === 0 || files.length > MAX_BATCH_FILES) {
        return NextResponse.json(
          { error: 'Upload between one and five image files' },
          { status: 400 }
        );
      }
      const images: Buffer[] = [];
      for (const file of files) images.push(await readProductImage(file));

      const existingCount = await prisma.listingImage.count({
        where: { productId },
      });
      let nextSort = existingCount;

      const results: Array<{ id: string; url: string; sortOrder: number }> = [];

      for (const buffer of images) {
        const uploaded = await uploadImageToCloudinary(buffer, {
          folder: `kiarakraft/products/${productId}`,
        });
        const created = await prisma.listingImage.create({
          data: { productId, url: uploaded.secure_url, sortOrder: nextSort++ },
        });
        results.push({
          id: created.id,
          url: created.url,
          sortOrder: created.sortOrder,
        });
      }

      return NextResponse.json({ success: true, images: results });
    } catch (error) {
      if (error instanceof ProductImageInputError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }
      console.error('Product image batch upload failed');
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  })
);

// Upload one or more images for a seller's product.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  if (isStagingDeployment()) {
    return NextResponse.json(
      { error: 'Image uploads are disabled in staging' },
      { status: 403 }
    );
  }
  return limitedUpload(request, context);
}

// Reorder images by providing an array of { id, sortOrder }
export const PATCH = withRateLimit(
  uploadRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params: routeParams }: { params: Promise<{ id: string }> }
  ) {
    const params = await routeParams;
    try {
      const session = await auth();
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { sellerProfile: true },
      });
      if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
        return NextResponse.json(
          { error: 'Seller profile required' },
          { status: 403 }
        );
      }

      const productId = params.id;
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sellerId: true },
      });
      if (!product || product.sellerId !== user.sellerProfile.id) {
        return NextResponse.json(
          { error: 'Product not found or not owned by seller' },
          { status: 404 }
        );
      }

      const body = await request.json();
      await reorderProductImages(prisma, productId, body?.order);

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof ImageOrderError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }
      console.error('Reorder images error:', error);
      return NextResponse.json({ error: 'Reorder failed' }, { status: 500 });
    }
  })
);
