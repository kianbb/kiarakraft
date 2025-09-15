import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductWithAI } from '@/lib/moderation-ai';
import { enhanceProductBeforeApproval } from '@/lib/product-enhancement-openai';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { revalidateProduct } from '@/lib/cache';
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { withCSRF } from '@/lib/csrf';
import { waitUntil } from '@vercel/functions';

export async function GET(
  _request: NextRequest,
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
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
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
        // Set to PENDING while we process enhancement and assessment
        eligibilityStatus: 'PENDING',
        eligibilityConfidence: null,
        eligibilityReasons: 'Product is being reviewed with AI enhancements',
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

    // Process enhancement and assessment asynchronously in background
    // Use Vercel's waitUntil to keep the function alive after response
    waitUntil(
      processProductEnhancementAndAssessment({
        product: updatedProduct,
        firstUploadedImageUrl: product.images?.[0]?.url,
        categorySlug: undefined,
        userId: user.id,
      }).catch((error: unknown) => {
        console.error(
          `Background processing failed for product ${updatedProduct.id}:`,
          error
        );
        Sentry.captureException(error);
      })
    );

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
  _request: NextRequest,
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

// Async function to process enhancement and assessment in background
async function processProductEnhancementAndAssessment({
  product,
  firstUploadedImageUrl,
  categorySlug,
  userId,
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
}) {
  const startTime = Date.now();
  console.log(`🚀 Starting background processing for product ${product.id}...`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Has image: ${!!firstUploadedImageUrl}`);

  // Update status to show processing has started
  await prisma.product.update({
    where: { id: product.id },
    data: {
      eligibilityReasons: '🔄 Step 1/3: Validating product data...',
    },
  });

  // Validate user exists
  try {
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!userExists) {
      console.error(`❌ USER NOT FOUND IN DATABASE: ${userId}`);
      throw new Error(`User ${userId} not found in database`);
    }

    console.log(`✅ User verified: ${userExists.email}`);
  } catch (error) {
    console.error('❌ Failed to verify user:', error);
    throw error;
  }

  let enhancedDescription = product.description;
  let enhancedTags: string[] | undefined;
  let enhancedImageUrl = firstUploadedImageUrl;
  let enhancementSuccessful = false;

  // STEP 1: Enhance product presentation with AI
  try {
    // Update status to show enhancement is starting
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityReasons:
          '🎨 Step 2/3: Enhancing product presentation with AI...',
      },
    });

    console.log(`🎨 Starting AI enhancement for product ${product.id}...`);
    const enhancement = await enhanceProductBeforeApproval({
      id: product.id,
      title: product.title,
      description: product.description,
      imageUrl: firstUploadedImageUrl,
      categorySlug,
      price: product.priceToman,
      userId,
      locale: 'fa', // Default to Persian for Iranian marketplace
    });

    if (enhancement.enhanced) {
      enhancementSuccessful = true;
      console.log(`✅ Enhancement successful for product ${product.id}`);

      // Handle enhanced image if available
      if (
        enhancement.imageUrl &&
        typeof enhancement.imageUrl === 'string' &&
        enhancement.imageUrl.startsWith('data:image/')
      ) {
        try {
          const base64 = enhancement.imageUrl.split(',')[1];
          if (base64) {
            console.log(`📸 Uploading enhanced image to Cloudinary...`);
            const buffer = Buffer.from(base64, 'base64');
            const upload = await uploadImageToCloudinary(buffer, {
              folder: `kiarakraft/products/${product.id}`,
              public_id: `enhanced-${Date.now()}`,
            });
            enhancedImageUrl = upload.secure_url;

            // Insert enhanced image as the first image
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

              // Push existing images down
              for (let i = 0; i < existingImages.length; i++) {
                await tx.listingImage.update({
                  where: { id: existingImages[i].id },
                  data: { sortOrder: i + 1 },
                });
              }
            });
            console.log(`✅ Enhanced image saved`);
          }
        } catch (e) {
          console.warn('Enhanced image upload failed:', e);
          Sentry.captureException(e);
        }
      }

      // Update product with enhanced content
      if (enhancement.description || enhancement.tags) {
        enhancedDescription = enhancement.description || product.description;
        enhancedTags = enhancement.tags;

        await prisma.product.update({
          where: { id: product.id },
          data: {
            description: enhancedDescription,
            tags: enhancedTags,
          },
        });
        console.log(`✅ Enhanced description and tags saved`);

        // Update progress
        await prisma.product.update({
          where: { id: product.id },
          data: {
            eligibilityReasons:
              '✨ Enhancement complete. Starting eligibility assessment...',
          },
        });
      }
    } else {
      console.log(`⚠️ Enhancement returned false for product ${product.id}`);

      // Update progress even if enhancement didn't make changes
      await prisma.product.update({
        where: { id: product.id },
        data: {
          eligibilityReasons:
            '⏭️ Enhancement skipped. Starting eligibility assessment...',
        },
      });
    }
  } catch (enhancementError) {
    console.error('❌ Enhancement failed:', enhancementError);
    Sentry.captureException(enhancementError);

    // Update status to show enhancement failed but continuing
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityReasons:
          '⚠️ Enhancement failed. Continuing with eligibility assessment...',
      },
    });
    // Continue with original content if enhancement fails
  }

  // STEP 2: Assess the (potentially enhanced) product for eligibility
  try {
    // Update status to show assessment is starting
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityReasons:
          '🔍 Step 3/3: Assessing product for marketplace eligibility...',
      },
    });

    console.log(`🔍 Starting AI assessment for product ${product.id}...`);
    const productToAssess = {
      title: product.title,
      description: enhancedDescription,
      imageUrl: enhancedImageUrl,
      categorySlug,
      price: product.priceToman,
      userId,
    };

    // Always use AI assessment - never use fallback
    const assessmentResult = await assessProductWithAI(productToAssess);

    // Update product with final assessment results
    // Store both English and Persian reasons as JSON
    const bilingualReasons = {
      en: assessmentResult.reasons?.join('; ') || '',
      fa:
        assessmentResult.reasons_fa?.join('; ') ||
        assessmentResult.reasons?.join('; ') ||
        '',
    };

    // Store bilingual reasons as JSON (PostgreSQL TEXT field can handle large content)
    // Increased limit to 10000 chars to preserve complete assessment feedback
    let jsonString = JSON.stringify(bilingualReasons);
    if (jsonString.length > 10000) {
      // If still too long, truncate at sentence boundaries to preserve JSON structure
      const maxReasonLength = 4500; // Leave room for JSON structure

      // Truncate English reason at sentence boundary
      if (bilingualReasons.en.length > maxReasonLength) {
        const truncated = bilingualReasons.en.slice(0, maxReasonLength);
        const lastPeriod = truncated.lastIndexOf('.');
        bilingualReasons.en =
          lastPeriod > 0
            ? truncated.slice(0, lastPeriod + 1)
            : truncated + '...';
      }

      // Truncate Persian reason at sentence boundary
      if (bilingualReasons.fa.length > maxReasonLength) {
        const truncated = bilingualReasons.fa.slice(0, maxReasonLength);
        const lastPeriod = truncated.lastIndexOf('.');
        bilingualReasons.fa =
          lastPeriod > 0
            ? truncated.slice(0, lastPeriod + 1)
            : truncated + '...';
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

    const totalDuration = Date.now() - startTime;
    console.log(
      `✅ Product ${product.id} fully processed in ${totalDuration}ms`
    );
    console.log(
      `   Status: ${assessmentResult.status} (${assessmentResult.confidence}%)`
    );
    console.log(
      `   Enhancement: ${enhancementSuccessful ? 'Success' : 'Failed/Skipped'}`
    );

    // Revalidate caches to reflect the updates
    try {
      await revalidateProduct(product.id);
    } catch {}

    // TODO: Send notification to user about the assessment result
    // This could be an email, push notification, or in-app notification
  } catch (assessmentError) {
    // Log detailed error information for debugging
    const errorDetails = {
      message:
        assessmentError instanceof Error
          ? assessmentError.message
          : String(assessmentError),
      stack:
        assessmentError instanceof Error
          ? assessmentError.stack?.split('\n').slice(0, 5)
          : undefined,
      productId: product.id,
      hasImage: !!enhancedImageUrl,
      userId,
      timestamp: new Date().toISOString(),
    };

    console.error('❌ Assessment failed with details:', errorDetails);
    Sentry.captureException(assessmentError, {
      extra: errorDetails,
    });

    // Create a user-friendly error message based on the actual error
    let errorReason = 'AI assessment unavailable - manual review required';

    if (assessmentError instanceof Error) {
      if (assessmentError.message.includes('API key')) {
        errorReason = 'AI configuration error - please contact support';
      } else if (
        assessmentError.message.includes('User') &&
        assessmentError.message.includes('not found')
      ) {
        errorReason = 'User validation failed - please re-login and try again';
      } else if (assessmentError.message.includes('Monthly AI usage limit')) {
        errorReason = 'Monthly AI limit exceeded - manual review required';
      } else if (
        assessmentError.message.includes('400 Error while downloading')
      ) {
        errorReason = 'Image processing failed - please re-upload image';
      } else {
        // Include the actual error for debugging
        errorReason = `AI error: ${assessmentError.message.substring(0, 100)}`;
      }
    }

    // Keep product as PENDING for manual review
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityStatus: 'PENDING',
        eligibilityConfidence: null,
        eligibilityReasons: errorReason,
      },
    });

    console.log(
      `⚠️ Product ${product.id} kept as PENDING due to: ${errorReason}`
    );
  }
}
