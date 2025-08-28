import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';
import {
  uploadImageToCloudinary,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
} from '@/lib/cloudinary';
import { withCSRF } from '@/lib/csrf';

export const runtime = 'nodejs';

// Upload one or more images for a seller's product
export const POST = withRateLimit(
  uploadRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
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

      const formData = await request.formData();
      const files = formData.getAll('files') as File[];
      if (!files || files.length === 0) {
        return NextResponse.json(
          { error: 'No files provided' },
          { status: 400 }
        );
      }

      const existingCount = await prisma.listingImage.count({
        where: { productId },
      });
      let nextSort = existingCount;

      const results: Array<{ id: string; url: string; sortOrder: number }> = [];

      for (const file of files) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
          return NextResponse.json(
            { error: `Invalid file type: ${file.type}` },
            { status: 400 }
          );
        }
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            {
              error: `File too large: max ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`,
            },
            { status: 400 }
          );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
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
      console.error('Upload product images error:', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  })
);

// Reorder images by providing an array of { id, sortOrder }
export const PATCH = withRateLimit(
  uploadRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
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
      const updates: Array<{ id: string; sortOrder: number }> =
        body?.order ?? [];
      if (!Array.isArray(updates) || updates.length === 0) {
        return NextResponse.json(
          { error: 'No order provided' },
          { status: 400 }
        );
      }

      await Promise.all(
        updates.map(u =>
          prisma.listingImage.update({
            where: { id: u.id },
            data: { sortOrder: u.sortOrder },
          })
        )
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Reorder images error:', error);
      return NextResponse.json({ error: 'Reorder failed' }, { status: 500 });
    }
  })
);
