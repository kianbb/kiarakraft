import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export const runtime = 'nodejs';

// Dynamic imports to avoid module loading failures in Next.js 16
const getSentry = () => import('@sentry/nextjs');
const getWaitUntil = () => import('@vercel/functions').then(m => m.waitUntil);
const getTranslator = () =>
  import('@/lib/translator').then(m => m.translateProductFields);
const getModeration = () =>
  import('@/lib/moderation-ai').then(m => m.assessProductWithAI);
const getEnhancement = () =>
  import('@/lib/product-enhancement-openai').then(
    m => m.enhanceProductBeforeApproval
  );
const getEnhancementNoAI = () =>
  import('@/lib/product-enhancement-noai').then(m => m.enhanceProductWithoutAI);
const getCloudinary = () =>
  import('@/lib/cloudinary').then(m => m.uploadImageToCloudinary);
const getCache = () => import('@/lib/cache').then(m => m.revalidateProduct);
const getProgress = () =>
  import('@/lib/progress-messages').then(m => m.getBilingualProgress);
const getCSRF = () => import('@/lib/csrf').then(m => m.withCSRF);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
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

    const Sentry = await getSentry();
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      console.log('❌ [API GET] User or seller profile not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: user.sellerProfile.id,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
      },
    });

    if (!product) {
      console.log('❌ [API GET] Product not found or not owned by seller');
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    console.log('✅ [API GET] Product found:', product.title);
    return NextResponse.json(product);
  } catch (error) {
    console.error('❌ [API GET] Error fetching product:', error);
    const Sentry = await getSentry();
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
}

// Wrapper for PUT with CSRF protection
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const withCSRF = await getCSRF();
  const handler = withCSRF(async function (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> | { id: string } }
  ) {
    return handlePUT(req, ctx);
  });
  return handler(request, context);
}

async function handlePUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const productId = resolvedParams.id;

    console.log('🔍 [API PUT] Updating product:', productId);

    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const Sentry = await getSentry();
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await request.json();
    const useAI = (data.useAI as boolean) ?? true;

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
        id: productId,
        sellerId: user.sellerProfile.id,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const nextActive =
      typeof data.active === 'boolean' ? data.active : undefined;
    const allowActive = user.sellerProfile.verified ? nextActive : undefined;

    const getBilingualProgress = await getProgress();
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        title: data.title,
        description: data.description,
        priceToman: data.priceToman,
        stock: data.stock,
        ...(allowActive !== undefined ? { active: allowActive } : {}),
        eligibilityStatus: 'PENDING',
        eligibilityConfidence: null,
        eligibilityReasons: getBilingualProgress('step1'),
      },
    });

    // Revalidate cache
    try {
      const revalidateProduct = await getCache();
      await revalidateProduct(productId);
    } catch (e) {
      console.warn('Cache revalidation failed:', e);
    }

    // Translate if Persian
    const hasPersian =
      /[\u0600-\u06FF]/.test(updatedProduct.title) ||
      /[\u0600-\u06FF]/.test(updatedProduct.description);
    if (hasPersian) {
      const hash = crypto
        .createHash('sha1')
        .update(updatedProduct.title + '|' + updatedProduct.description)
        .digest('hex');

      getTranslator()
        .then(translateProductFields =>
          translateProductFields(
            {
              title: updatedProduct.title,
              description: updatedProduct.description,
            },
            'fa',
            'en'
          )
        )
        .then(async en => {
          await prisma.productTranslation.upsert({
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
        .catch(e => console.error('Translation error:', e));
    }

    // Process in background
    const waitUntil = await getWaitUntil();
    waitUntil(
      processProductEnhancementAndAssessment({
        product: updatedProduct,
        firstUploadedImageUrl: product.images?.[0]?.url,
        categorySlug: undefined,
        userId: user.id,
        skipEnhancement: !useAI,
      }).catch(async (error: unknown) => {
        console.error(`Background processing failed:`, error);
        const Sentry = await getSentry();
        Sentry.captureException(error);
      })
    );

    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    const Sentry = await getSentry();
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

// Wrapper for DELETE with CSRF protection
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const withCSRF = await getCSRF();
  const handler = withCSRF(async function (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> | { id: string } }
  ) {
    return handleDELETE(req, ctx);
  });
  return handler(request, context);
}

async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const productId = resolvedParams.id;

    console.log('🔍 [API DELETE] Deleting product:', productId);

    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const Sentry = await getSentry();
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
        id: productId,
        sellerId: user.sellerProfile.id,
      },
    });

    if (!product) {
      const productExists = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sellerId: true },
      });

      if (productExists) {
        return NextResponse.json(
          { error: 'You do not have permission to delete this product' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    await prisma.$transaction(async tx => {
      await tx.cartItem.deleteMany({ where: { productId } });
      await tx.wishlistItem.deleteMany({ where: { productId } });
      await tx.review.deleteMany({ where: { productId } });
      await tx.productTranslation.deleteMany({ where: { productId } });
      await tx.listingImage.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });

    try {
      const revalidateProduct = await getCache();
      await revalidateProduct(productId);
    } catch (e) {
      console.warn('Cache revalidation failed:', e);
    }

    return NextResponse.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    const Sentry = await getSentry();
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}

// Background processing function
async function processProductEnhancementAndAssessment({
  product,
  firstUploadedImageUrl,
  categorySlug,
  userId,
  skipEnhancement = false,
}: {
  product: {
    id: string;
    title: string;
    description: string;
    priceToman: number;
  };
  firstUploadedImageUrl?: string;
  categorySlug?: string;
  userId: string;
  skipEnhancement?: boolean;
}) {
  const startTime = Date.now();
  console.log(`🚀 Starting background processing for product ${product.id}...`);

  const getBilingualProgress = await getProgress();
  const Sentry = await getSentry();

  await prisma.product.update({
    where: { id: product.id },
    data: { eligibilityReasons: getBilingualProgress('step1') },
  });

  // Validate user
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!userExists) {
    throw new Error(`User ${userId} not found`);
  }

  let enhancedDescription = product.description;
  let enhancedImageUrl = firstUploadedImageUrl;
  let enhancementSuccessful = false;

  // STEP 1: Enhancement
  if (!skipEnhancement) {
    try {
      await prisma.product.update({
        where: { id: product.id },
        data: { eligibilityReasons: getBilingualProgress('step2') },
      });

      const enhanceProductBeforeApproval = await getEnhancement();
      const enhancement = await enhanceProductBeforeApproval({
        id: product.id,
        title: product.title,
        description: product.description,
        imageUrl: firstUploadedImageUrl,
        categorySlug,
        price: product.priceToman,
        userId,
        locale: 'fa',
      });

      if (enhancement.enhanced) {
        enhancementSuccessful = true;

        // Handle enhanced image
        if (enhancement.imageUrl?.startsWith('data:image/')) {
          try {
            const base64 = enhancement.imageUrl.split(',')[1];
            if (base64) {
              const uploadImageToCloudinary = await getCloudinary();
              const buffer = Buffer.from(base64, 'base64');
              const upload = await uploadImageToCloudinary(buffer, {
                folder: `kiarakraft/products/${product.id}`,
                public_id: `enhanced-${Date.now()}`,
              });
              enhancedImageUrl = upload.secure_url;

              const existingImages = await prisma.listingImage.findMany({
                where: { productId: product.id },
                orderBy: { sortOrder: 'asc' },
                select: { id: true },
              });

              await prisma.$transaction(async tx => {
                await tx.listingImage.create({
                  data: {
                    productId: product.id,
                    url: enhancedImageUrl!,
                    alt: `${product.title} (enhanced)`,
                    sortOrder: 0,
                  },
                });
                for (let i = 0; i < existingImages.length; i++) {
                  await tx.listingImage.update({
                    where: { id: existingImages[i].id },
                    data: { sortOrder: i + 1 },
                  });
                }
              });
            }
          } catch (e) {
            console.warn('Enhanced image upload failed:', e);
            Sentry.captureException(e);
          }
        }

        // Update product
        if (enhancement.description || enhancement.tags || enhancement.title) {
          enhancedDescription = enhancement.description || product.description;
          const tagsToStore =
            enhancement.tagsEn && enhancement.tagsEn.length > 0
              ? { fa: enhancement.tags || [], en: enhancement.tagsEn }
              : enhancement.tags;

          await prisma.product.update({
            where: { id: product.id },
            data: {
              title: enhancement.title || product.title,
              description: enhancedDescription,
              tags: tagsToStore,
            },
          });

          // Save English translation
          if (enhancement.titleEn || enhancement.descriptionEn) {
            try {
              await prisma.productTranslation.upsert({
                where: {
                  productId_locale: { productId: product.id, locale: 'en' },
                },
                create: {
                  productId: product.id,
                  locale: 'en',
                  title: enhancement.titleEn || product.title,
                  description: enhancement.descriptionEn || product.description,
                },
                update: {
                  title: enhancement.titleEn || product.title,
                  description: enhancement.descriptionEn || product.description,
                },
              });
            } catch (e) {
              console.error('Translation save failed:', e);
            }
          }

          await prisma.product.update({
            where: { id: product.id },
            data: {
              eligibilityReasons: getBilingualProgress('enhancementComplete'),
            },
          });
        }
      } else {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            eligibilityReasons: getBilingualProgress('enhancementSkipped'),
          },
        });
      }
    } catch (e) {
      console.error('Enhancement failed:', e);
      Sentry.captureException(e);
      await prisma.product.update({
        where: { id: product.id },
        data: {
          eligibilityReasons: getBilingualProgress('enhancementSkipped'),
        },
      });
    }
  } else {
    // Non-AI processing
    try {
      await prisma.product.update({
        where: { id: product.id },
        data: { eligibilityReasons: getBilingualProgress('step2') },
      });

      const existingProduct = await prisma.product.findUnique({
        where: { id: product.id },
        select: { tags: true },
      });

      const enhanceProductWithoutAI = await getEnhancementNoAI();
      const enhancement = await enhanceProductWithoutAI({
        id: product.id,
        title: product.title,
        description: product.description,
        imageUrl: firstUploadedImageUrl,
        tags: existingProduct?.tags,
        locale: 'fa',
      });

      if (enhancement.enhanced) {
        if (
          enhancement.imageUrl &&
          enhancement.imageUrl !== firstUploadedImageUrl
        ) {
          enhancedImageUrl = enhancement.imageUrl;
          const existingImages = await prisma.listingImage.findMany({
            where: { productId: product.id },
            orderBy: { sortOrder: 'asc' },
            select: { id: true },
          });

          await prisma.$transaction(async tx => {
            await tx.listingImage.create({
              data: {
                productId: product.id,
                url: enhancedImageUrl!,
                alt: `${product.title} (resized)`,
                sortOrder: 0,
              },
            });
            for (let i = 0; i < existingImages.length; i++) {
              await tx.listingImage.update({
                where: { id: existingImages[i].id },
                data: { sortOrder: i + 1 },
              });
            }
          });
        }

        if (enhancement.title || enhancement.tags) {
          enhancedDescription = enhancement.description || product.description;
          const tagsToStore =
            enhancement.tagsEn && enhancement.tagsEn.length > 0
              ? { fa: enhancement.tagsFa || [], en: enhancement.tagsEn }
              : enhancement.tags;

          await prisma.product.update({
            where: { id: product.id },
            data: {
              title: enhancement.title || product.title,
              description: enhancedDescription,
              tags: tagsToStore,
            },
          });

          if (enhancement.descriptionEn || enhancement.titleEn) {
            try {
              await prisma.productTranslation.upsert({
                where: {
                  productId_locale: { productId: product.id, locale: 'en' },
                },
                create: {
                  productId: product.id,
                  locale: 'en',
                  title: enhancement.titleEn || product.title,
                  description: enhancement.descriptionEn || product.description,
                },
                update: {
                  title: enhancement.titleEn || product.title,
                  description: enhancement.descriptionEn || product.description,
                },
              });
            } catch (e) {
              console.error('Translation save failed:', e);
              Sentry.captureException(e);
            }
          }

          await prisma.product.update({
            where: { id: product.id },
            data: {
              eligibilityReasons: getBilingualProgress('enhancementComplete'),
            },
          });
        }
      } else {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            eligibilityReasons: getBilingualProgress('enhancementSkipped'),
          },
        });
      }
    } catch (e) {
      console.error('Non-AI processing failed:', e);
      Sentry.captureException(e);
      await prisma.product.update({
        where: { id: product.id },
        data: { eligibilityReasons: getBilingualProgress('step3') },
      });
    }
  }

  // STEP 2: Assessment
  try {
    await prisma.product.update({
      where: { id: product.id },
      data: { eligibilityReasons: getBilingualProgress('step3') },
    });

    const assessProductWithAI = await getModeration();
    const assessmentResult = await assessProductWithAI({
      title: product.title,
      description: enhancedDescription,
      imageUrl: enhancedImageUrl,
      categorySlug,
      price: product.priceToman,
      userId,
    });

    const bilingualReasons = {
      en: assessmentResult.reasons?.join('; ') || '',
      fa:
        assessmentResult.reasons_fa?.join('; ') ||
        assessmentResult.reasons?.join('; ') ||
        '',
    };

    let jsonString = JSON.stringify(bilingualReasons);
    if (jsonString.length > 10000) {
      const maxLen = 4500;
      if (bilingualReasons.en.length > maxLen) {
        const t = bilingualReasons.en.slice(0, maxLen);
        const p = t.lastIndexOf('.');
        bilingualReasons.en = p > 0 ? t.slice(0, p + 1) : t + '...';
      }
      if (bilingualReasons.fa.length > maxLen) {
        const t = bilingualReasons.fa.slice(0, maxLen);
        const p = t.lastIndexOf('.');
        bilingualReasons.fa = p > 0 ? t.slice(0, p + 1) : t + '...';
      }
      jsonString = JSON.stringify(bilingualReasons);
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityStatus: assessmentResult.status,
        eligibilityConfidence: assessmentResult.confidence ?? null,
        eligibilityReasons: jsonString,
      },
    });

    console.log(
      `✅ Product ${product.id} processed in ${Date.now() - startTime}ms`
    );
    console.log(
      `   Status: ${assessmentResult.status} (${assessmentResult.confidence}%)`
    );

    try {
      const revalidateProduct = await getCache();
      await revalidateProduct(product.id);
    } catch {}
  } catch (assessmentError) {
    console.error('Assessment failed:', assessmentError);
    Sentry.captureException(assessmentError);

    let errorReason = 'AI assessment unavailable - manual review required';
    if (assessmentError instanceof Error) {
      if (assessmentError.message.includes('API key')) {
        errorReason = 'AI configuration error - please contact support';
      } else if (assessmentError.message.includes('Monthly AI usage limit')) {
        errorReason = 'Monthly AI limit exceeded - manual review required';
      } else {
        errorReason = `AI error: ${assessmentError.message.substring(0, 100)}`;
      }
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityStatus: 'PENDING',
        eligibilityConfidence: null,
        eligibilityReasons: errorReason,
      },
    });
  }
}
