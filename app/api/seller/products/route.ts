import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductForHandcrafted } from '@/lib/moderation';
import { assessProductWithAI } from '@/lib/moderation-ai';
import { enhanceProductBeforeApproval } from '@/lib/product-enhancement-openai';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { withRateLimit, sellerProductRateLimit } from '@/lib/rateLimit';
import { revalidateProduct } from '@/lib/cache';
import {
  sanitizeAndValidate,
  SanitizationLevel,
} from '@/lib/input-sanitization';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { withCSRF } from '@/lib/csrf';

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

  let enhancedDescription = product.description;
  let enhancedTags: string[] | undefined;
  let enhancedImageUrl = firstUploadedImageUrl;
  let enhancementSuccessful = false;

  // STEP 1: Enhance product presentation with AI
  try {
    console.log(`🎨 Starting AI enhancement for product ${product.id}...`);
    const enhancement = await enhanceProductBeforeApproval({
      id: product.id,
      title: product.title,
      description: product.description,
      imageUrl: firstUploadedImageUrl,
      categorySlug,
      price: product.priceToman,
      userId,
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
      }
    } else {
      console.log(`⚠️ Enhancement returned false for product ${product.id}`);
    }
  } catch (enhancementError) {
    console.error('❌ Enhancement failed:', enhancementError);
    Sentry.captureException(enhancementError);
    // Continue with original content if enhancement fails
  }

  // STEP 2: Assess the (potentially enhanced) product for eligibility
  try {
    console.log(`🔍 Starting AI assessment for product ${product.id}...`);

    const productToAssess = {
      title: product.title,
      description: enhancedDescription,
      imageUrl: enhancedImageUrl,
      categorySlug,
      price: product.priceToman,
      userId,
    };

    const assessmentResult = enhancedImageUrl
      ? await assessProductWithAI(productToAssess)
      : await assessProductForHandcrafted(productToAssess);

    // Update product with final assessment results
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityStatus: assessmentResult.status,
        eligibilityConfidence: assessmentResult.confidence ?? null,
        eligibilityReasons:
          assessmentResult.reasons?.join('; ').slice(0, 1000) || null,
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
    console.error('❌ Assessment failed:', assessmentError);
    Sentry.captureException(assessmentError);

    // If assessment fails, set a safe default
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityStatus: 'REJECTED',
        eligibilityConfidence: 0,
        eligibilityReasons:
          'Assessment failed - please contact support if this persists',
      },
    });
  }
}

export const GET = withRateLimit(
  sellerProductRateLimit,
  async function (request: NextRequest) {
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
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Optionally gate: allow viewing their products regardless, but note verification
      // If stricter policy desired, uncomment next block to require verification for listing
      // if (!user.sellerProfile.verified) {
      //   return NextResponse.json({ error: 'Seller verification required' }, { status: 403 });
      // }

      const { searchParams } = new URL(request.url);
      const limitParam = searchParams.get('limit');
      const limit = limitParam
        ? Math.min(Math.max(1, parseInt(limitParam)), 100)
        : 50;

      const products = await prisma.product.findMany({
        where: { sellerId: user.sellerProfile.id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return NextResponse.json(products);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error fetching seller products:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }
  }
);

export const POST = withRateLimit(
  sellerProductRateLimit,
  withCSRF(async function (request: NextRequest) {
    let data: Record<string, unknown> = {};
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
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      data = await request.json();

      // Comprehensive input validation and sanitization
      const titleValidation = sanitizeAndValidate((data.name as string) || '', {
        maxLength: 200,
        minLength: 3,
        sanitizationLevel: SanitizationLevel.STRICT,
        allowEmpty: false,
        detectThreats: true,
      });

      if (!titleValidation.isValid) {
        console.warn(
          'Product title validation failed:',
          titleValidation.errors
        );
        return NextResponse.json(
          {
            error:
              'Invalid product title: ' + titleValidation.errors.join(', '),
          },
          { status: 400 }
        );
      }

      const descriptionValidation = sanitizeAndValidate(
        (data.description as string) || '',
        {
          maxLength: 5000,
          minLength: 10,
          sanitizationLevel: SanitizationLevel.MODERATE,
          allowEmpty: false,
          detectThreats: true,
        }
      );

      if (!descriptionValidation.isValid) {
        console.warn(
          'Product description validation failed:',
          descriptionValidation.errors
        );
        return NextResponse.json(
          {
            error:
              'Invalid product description: ' +
              descriptionValidation.errors.join(', '),
          },
          { status: 400 }
        );
      }

      // Log security threats for monitoring
      if (titleValidation.threats && titleValidation.threats.length > 0) {
        console.warn(
          'Security threats detected in product title:',
          titleValidation.threats
        );
        Sentry.addBreadcrumb({
          message: 'Security threats in product title',
          data: { threats: titleValidation.threats },
          level: 'warning',
        });
      }

      if (
        descriptionValidation.threats &&
        descriptionValidation.threats.length > 0
      ) {
        console.warn(
          'Security threats detected in product description:',
          descriptionValidation.threats
        );
        Sentry.addBreadcrumb({
          message: 'Security threats in product description',
          data: { threats: descriptionValidation.threats },
          level: 'warning',
        });
      }

      // Resolve categoryId by slug (optional)
      let categoryId: string | undefined;
      if (data.category) {
        const cat = await prisma.category.findUnique({
          where: { slug: data.category as string },
        });
        categoryId = cat?.id;
      }

      const isVerified = !!user.sellerProfile.verified;

      const product = await prisma.product.create({
        data: {
          title: titleValidation.sanitized,
          description: descriptionValidation.sanitized,
          priceToman: data.price as number,
          stock: data.stock as number,
          slug: (data.slug as string) || generateSlug(data.name as string),
          categoryId,
          sellerId: user.sellerProfile.id,
          // Trust & Safety: Unverified sellers' products are created inactive
          active: isVerified,
        },
      });

      // Create listing images from the uploaded images
      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        const imageCreations = data.images.map(
          (
            img: { url: string; alt?: string; sortOrder?: number },
            index: number
          ) => ({
            productId: product.id,
            url: img.url,
            alt: img.alt || (data.name as string),
            sortOrder: img.sortOrder ?? index,
          })
        );

        await prisma.listingImage.createMany({
          data: imageCreations,
        });
      }

      // Fire-and-forget translation to English from Persian
      // If the source looks Persian, translate to EN; otherwise skip
      const hasPersian =
        /[\u0600-\u06FF]/.test(product.title) ||
        /[\u0600-\u06FF]/.test(product.description);
      if (hasPersian) {
        const hash = crypto
          .createHash('sha1')
          .update(product.title + '|' + product.description)
          .digest('hex');
        // Best-effort; don't block response
        translateProductFields(
          { title: product.title, description: product.description },
          'fa',
          'en'
        )
          .then(async en => {
            try {
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
                  productId_locale: { productId: product.id, locale: 'en' },
                },
                create: {
                  productId: product.id,
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
            } catch (e) {
              console.error('Failed to store EN translation', e);
            }
          })
          .catch(e => console.error('Translation error', e));
      }

      // Capture the first uploaded image URL (if any) to pass into AI steps
      const images = data.images as Array<{ url?: string }> | undefined;
      const firstUploadedImageUrl: string | undefined =
        images && Array.isArray(images) && images.length > 0
          ? images[0]?.url
          : undefined;

      // Return product immediately with PENDING status while processing happens in background
      const productWithImages = await prisma.product.findUnique({
        where: { id: product.id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      // Start async processing for enhancement and assessment
      // This runs in the background while we return to the user immediately
      processProductEnhancementAndAssessment({
        product,
        firstUploadedImageUrl,
        categorySlug: (data.category as string) || undefined,
        userId: user.id,
      }).catch((error: unknown) => {
        console.error(
          `Background processing failed for product ${product.id}:`,
          error
        );
        Sentry.captureException(error);
      });

      // Return immediately with PENDING status
      return NextResponse.json({
        ...productWithImages,
        eligibilityStatus: 'PENDING',
        message:
          'Product is under review. You will be notified once the review is complete.',
      });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error creating product:', error);

      // Provide detailed error message based on error type
      let errorMessage = 'Failed to create product';
      let errorDetails = '';

      if (error instanceof Error) {
        // Check for specific Prisma errors
        if (error.message.includes('Unique constraint')) {
          if (error.message.includes('slug')) {
            errorMessage = 'Failed to generate unique product URL';
            errorDetails = 'Please try again or use a different title';
          } else {
            errorMessage = 'A product with this title already exists';
            errorDetails = 'Please choose a different title';
          }
        } else if (error.message.includes('Foreign key constraint')) {
          errorMessage = 'Invalid category or seller information';
          errorDetails =
            'Please make sure you have completed seller registration';
        } else if (error.message.includes('sellerId')) {
          errorMessage = 'Seller profile not found';
          errorDetails = 'Please complete your seller profile setup first';
        } else if (
          error.message.includes('Invalid `prisma.product.create()` invocation')
        ) {
          errorMessage = 'Invalid product data';
          errorDetails =
            'Please check all required fields are filled correctly';
        } else {
          // Include actual error message for debugging
          errorDetails = error.message;
        }
      }

      return NextResponse.json(
        {
          error: errorMessage,
          details: errorDetails,
          // Include field-specific errors if validation failed
          fields: {
            title:
              data.name && (data.name as string).length < 3
                ? 'Title must be at least 3 characters'
                : null,
            description:
              data.description && (data.description as string).length < 10
                ? 'Description must be at least 10 characters'
                : null,
            price:
              !data.price || (data.price as number) <= 0
                ? 'Price must be greater than 0'
                : null,
            stock:
              (data.stock as number) < 0 ? 'Stock cannot be negative' : null,
          },
        },
        { status: 500 }
      );
    }
  })
);

function generateSlug(input: string) {
  // Generate base slug
  let slug = input
    .toString()
    .trim()
    .toLowerCase()
    // Replace Persian spaces and punctuation too
    .replace(/[\s\u200c]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^\-+|\-+$/g, '');

  // If slug is empty (e.g., all Persian text), use a random string
  if (!slug) {
    slug = 'product';
  }

  // Add a random suffix to ensure uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${slug}-${randomSuffix}`;
}
