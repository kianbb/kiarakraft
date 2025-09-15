import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
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
import { waitUntil } from '@vercel/functions';

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

        // Save English translation if provided
        if (enhancement.descriptionEn) {
          try {
            // Check if translation already exists
            const existingTranslation =
              await prisma.productTranslation.findUnique({
                where: {
                  productId_locale: {
                    productId: product.id,
                    locale: 'en',
                  },
                },
              });

            if (existingTranslation) {
              // Update existing translation
              await prisma.productTranslation.update({
                where: {
                  productId_locale: {
                    productId: product.id,
                    locale: 'en',
                  },
                },
                data: {
                  description: enhancement.descriptionEn,
                },
              });
              console.log(`✅ Updated English translation`);
            } else {
              // Create new translation
              await prisma.productTranslation.create({
                data: {
                  productId: product.id,
                  locale: 'en',
                  title: product.title, // Will need proper translation later
                  description: enhancement.descriptionEn,
                },
              });
              console.log(`✅ Created English translation`);
            }
          } catch (translationError) {
            console.error(
              'Failed to save English translation:',
              translationError
            );
            // Don't fail the whole process if translation save fails
          }
        }

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
    // Log detailed enhancement error
    const enhancementErrorDetails = {
      message:
        enhancementError instanceof Error
          ? enhancementError.message
          : String(enhancementError),
      stack:
        enhancementError instanceof Error
          ? enhancementError.stack?.split('\n').slice(0, 3)
          : undefined,
      productId: product.id,
      hasImage: !!firstUploadedImageUrl,
      imageUrl: firstUploadedImageUrl?.substring(0, 100),
      userId,
    };

    console.error(
      '❌ Enhancement failed with details:',
      enhancementErrorDetails
    );
    Sentry.captureException(enhancementError, {
      extra: enhancementErrorDetails,
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
          .then(async (en: { title: string; description: string } | null) => {
            if (!en) return;
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
          .catch((e: unknown) => console.error('Translation error', e));
      }

      // Return product immediately with PENDING status while processing happens in background
      const productWithImages = await prisma.product.findUnique({
        where: { id: product.id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      // Get the actual image URL from the database, not the request
      const firstUploadedImageUrl = productWithImages?.images?.[0]?.url;

      console.log(
        `📸 Product ${product.id} has ${productWithImages?.images?.length || 0} images`
      );
      if (firstUploadedImageUrl) {
        console.log(
          `   First image URL: ${firstUploadedImageUrl.substring(0, 50)}...`
        );
      }

      // Start async processing for enhancement and assessment
      // Use Vercel's waitUntil to keep the function alive after response
      waitUntil(
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
        })
      );

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
