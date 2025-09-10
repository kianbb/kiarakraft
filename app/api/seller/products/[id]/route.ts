import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductForHandcrafted } from '@/lib/moderation';
import { revalidateProduct } from '@/lib/cache';
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { withCSRF } from '@/lib/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        sellerId: user.sellerProfile.id,
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
}

export const PUT = withCSRF(async function (
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await request.json();
    if (
      (data.title?.length || 0) > 200 ||
      (data.description?.length || 0) > 5000
    ) {
      return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }
    const suspicious =
      /<script|https?:\/\//i.test(data.description || '') ||
      /(?:viagra|casino|bet)/i.test(data.description || '');
    if (suspicious) {
      return NextResponse.json(
        { error: 'Content not allowed' },
        { status: 400 }
      );
    }

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        sellerId: user.sellerProfile.id,
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Prevent unverified sellers from self-activating products
    const nextActive =
      typeof data.active === 'boolean' ? data.active : undefined;
    const allowActive = user.sellerProfile.verified ? nextActive : undefined;

    const updatedProduct = await prisma.product.update({
      where: { id: params.id },
      data: {
        title: data.title,
        description: data.description,
        priceToman: data.priceToman,
        stock: data.stock,
        ...(allowActive !== undefined ? { active: allowActive } : {}),
      },
    });

    // Revalidate product-related caches
    try {
      await revalidateProduct(params.id);
    } catch (e) {
      console.warn('Cache revalidation (product update) failed:', e);
    }

    // Re-translate EN if source appears Persian
    const hasPersian =
      /[\u0600-\u06FF]/.test(updatedProduct.title) ||
      /[\u0600-\u06FF]/.test(updatedProduct.description);
    if (hasPersian) {
      const hash = crypto
        .createHash('sha1')
        .update(updatedProduct.title + '|' + updatedProduct.description)
        .digest('hex');
      translateProductFields(
        {
          title: updatedProduct.title,
          description: updatedProduct.description,
        },
        'fa',
        'en'
      )
        .then(async en => {
          type PTClient = {
            productTranslation: {
              upsert: (args: {
                where: {
                  productId_locale: { productId: string; locale: string };
                };
                create: {
                  productId: string;
                  locale: string;
                  title: string;
                  description: string;
                  sourceHash: string;
                };
                update: {
                  title: string;
                  description: string;
                  sourceHash: string;
                };
              }) => Promise<void>;
            };
          };
          const client = prisma as unknown as PTClient;
          await client.productTranslation.upsert({
            where: {
              productId_locale: { productId: updatedProduct.id, locale: 'en' },
            },
            create: {
              productId: updatedProduct.id,
              locale: 'en',
              title: en.title,
              description: en.description,
              sourceHash: hash,
            },
            update: {
              title: en.title,
              description: en.description,
              sourceHash: hash,
            },
          });
        })
        .catch(e => console.error('Translation error (update)', e));
    }

    // Update handcrafted eligibility in background (best-effort)
    assessProductForHandcrafted({
      title: updatedProduct.title,
      description: updatedProduct.description,
      categorySlug: undefined,
    })
      .then(async res => {
        try {
          await prisma.product.update({
            where: { id: updatedProduct.id },
            data: {
              ...({
                eligibilityStatus: res.status,
                eligibilityConfidence: res.confidence ?? null,
                eligibilityReasons:
                  res.reasons?.join('; ').slice(0, 1000) || null,
              } as Record<string, unknown>),
            },
          });
        } catch (e) {
          console.error('Failed to update eligibility', e);
          Sentry.captureException(e);
        }
      })
      .catch(e => console.error('Eligibility error (update)', e));

    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    );
  }
});

export const DELETE = withCSRF(async function (
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('Delete request for product:', {
      productId: params.id,
      sellerId: user.sellerProfile.id,
      userEmail: session.user.email,
    });

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        sellerId: user.sellerProfile.id,
      },
    });

    if (!product) {
      // Check if product exists but belongs to different seller
      const productExists = await prisma.product.findUnique({
        where: { id: params.id },
        select: { id: true, sellerId: true },
      });

      if (productExists) {
        console.error('Product exists but belongs to different seller:', {
          productSellerId: productExists.sellerId,
          currentSellerId: user.sellerProfile.id,
        });
        return NextResponse.json(
          {
            error: 'You do not have permission to delete this product',
          },
          { status: 403 }
        );
      }

      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Delete related records first to handle foreign key constraints
    await prisma.$transaction(async tx => {
      // Delete related records
      await tx.cartItem.deleteMany({
        where: { productId: params.id },
      });

      await tx.wishlistItem.deleteMany({
        where: { productId: params.id },
      });

      await tx.review.deleteMany({
        where: { productId: params.id },
      });

      await tx.productTranslation.deleteMany({
        where: { productId: params.id },
      });

      await tx.listingImage.deleteMany({
        where: { productId: params.id },
      });

      // Finally delete the product
      await tx.product.delete({
        where: { id: params.id },
      });
    });

    // Revalidate product-related caches post-delete
    try {
      await revalidateProduct(params.id);
    } catch (e) {
      console.warn('Cache revalidation (product delete) failed:', e);
    }

    return NextResponse.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
});
