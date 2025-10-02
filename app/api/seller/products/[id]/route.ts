import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductWithAI } from '@/lib/moderation-ai';
import { enhanceProductBeforeApproval } from '@/lib/product-enhancement-openai';
import { enhanceProductWithoutAI } from '@/lib/product-enhancement-noai';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { revalidateProduct } from '@/lib/cache';
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { withCSRF } from '@/lib/csrf';
import { waitUntil } from '@vercel/functions';
import { getBilingualProgress } from '@/lib/progress-messages';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle params as Promise (Next.js 15 change)
    const resolvedParams = await params;
    const productId = resolvedParams.id;

    console.log('🔍 [API GET] Fetching product:', productId);

    const session = await auth();

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      console.log('❌ [API GET] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true },
    });

    if (!user || !user.sellerProfile) {
      console.log('❌ [API GET] User or seller profile not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log(
      '✅ [API GET] User authenticated, seller ID:',
      user.sellerProfile.id
    );

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: user.sellerProfile.id,
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
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
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace'
    );
    Sentry.captureException(error);
    return NextResponse.json(
      {
        error: 'Failed to fetch product',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const PUT = withCSRF(async function (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle params as Promise (Next.js 15 change)
    const resolvedParams = await params;
    const productId = resolvedParams.id;

    console.log('🔍 [API PUT] Updating product:', productId);

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
    const useAI = (data.useAI as boolean) ?? true; // Default to true for backward compatibility
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

    // Always set to PENDING for assessment (with or without enhancement)
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

    // Revalidate product-related caches
    try {
      await revalidateProduct(productId);
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

    // Always process assessment in background (with or without enhancement)
    // Use Vercel's waitUntil to keep the function alive after response
    waitUntil(
      processProductEnhancementAndAssessment({
        product: updatedProduct,
        firstUploadedImageUrl: product.images?.[0]?.url,
        categorySlug: undefined,
        userId: user.id,
        skipEnhancement: !useAI, // Skip enhancement when useAI is false
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
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle params as Promise (Next.js 15 change)
    const resolvedParams = await params;
    const productId = resolvedParams.id;

    console.log('🔍 [API DELETE] Deleting product:', productId);

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
      productId: productId,
      sellerId: user.sellerProfile.id,
      userEmail: session.user.email,
    });

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        sellerId: user.sellerProfile.id,
      },
    });

    if (!product) {
      // Check if product exists but belongs to different seller
      const productExists = await prisma.product.findUnique({
        where: { id: productId },
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
        where: { productId: productId },
      });

      await tx.wishlistItem.deleteMany({
        where: { productId: productId },
      });

      await tx.review.deleteMany({
        where: { productId: productId },
      });

      await tx.productTranslation.deleteMany({
        where: { productId: productId },
      });

      await tx.listingImage.deleteMany({
        where: { productId: productId },
      });

      // Finally delete the product
      await tx.product.delete({
        where: { id: productId },
      });
    });

    // Revalidate product-related caches post-delete
    try {
      await revalidateProduct(productId);
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
  console.log(`   User ID: ${userId}`);
  console.log(`   Has image: ${!!firstUploadedImageUrl}`);
  console.log(
    `   Mode: ${skipEnhancement ? 'Assessment only' : 'Enhancement + Assessment'}`
  );

  // Update status to show processing has started
  await prisma.product.update({
    where: { id: product.id },
    data: {
      eligibilityReasons: getBilingualProgress('step1'),
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
  let enhancedImageUrl = firstUploadedImageUrl;
  let enhancementSuccessful = false;

  // STEP 1: Enhance product presentation with AI (skip if requested)
  if (!skipEnhancement) {
    try {
      // Update status to show enhancement is starting
      await prisma.product.update({
        where: { id: product.id },
        data: {
          eligibilityReasons: getBilingualProgress('step2'),
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
        if (enhancement.description || enhancement.tags || enhancement.title) {
          const enhancedTitle = enhancement.title || product.title;
          enhancedDescription = enhancement.description || product.description;

          // Store tags as an object with language keys if we have English tags
          const tagsToStore =
            enhancement.tagsEn && enhancement.tagsEn.length > 0
              ? { fa: enhancement.tags || [], en: enhancement.tagsEn }
              : enhancement.tags; // Keep as simple array if no English tags

          await prisma.product.update({
            where: { id: product.id },
            data: {
              title: enhancedTitle,
              description: enhancedDescription,
              tags: tagsToStore,
            },
          });
          console.log(`✅ Enhanced title, description and tags saved`);

          // Save English translation if provided
          if (enhancement.titleEn || enhancement.descriptionEn) {
            try {
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
                await prisma.productTranslation.update({
                  where: {
                    productId_locale: {
                      productId: product.id,
                      locale: 'en',
                    },
                  },
                  data: {
                    title: enhancement.titleEn || existingTranslation.title,
                    description:
                      enhancement.descriptionEn ||
                      existingTranslation.description,
                  },
                });
                console.log(`✅ Updated English translation`);
              } else {
                await prisma.productTranslation.create({
                  data: {
                    productId: product.id,
                    locale: 'en',
                    title: enhancement.titleEn || product.title,
                    description:
                      enhancement.descriptionEn || product.description,
                  },
                });
                console.log(`✅ Created English translation`);
              }
            } catch (translationError) {
              console.error(
                'Failed to save English translation:',
                translationError
              );
            }
          }

          // Update progress
          await prisma.product.update({
            where: { id: product.id },
            data: {
              eligibilityReasons: getBilingualProgress('enhancementComplete'),
            },
          });
        }
      } else {
        console.log(`⚠️ Enhancement returned false for product ${product.id}`);

        // Update progress even if enhancement didn't make changes
        await prisma.product.update({
          where: { id: product.id },
          data: {
            eligibilityReasons: getBilingualProgress('enhancementSkipped'),
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
          eligibilityReasons: getBilingualProgress('enhancementSkipped'),
        },
      });
      // Continue with original content if enhancement fails
    }
  } else {
    // Use non-AI processing (translation and image resizing)
    try {
      // Update status to show non-AI processing is starting
      await prisma.product.update({
        where: { id: product.id },
        data: {
          eligibilityReasons: getBilingualProgress('step2'),
        },
      });

      console.log(`🌐 Starting non-AI processing for product ${product.id}...`);

      // Get existing tags if any
      const existingProduct = await prisma.product.findUnique({
        where: { id: product.id },
        select: { tags: true },
      });

      const enhancement = await enhanceProductWithoutAI({
        id: product.id,
        title: product.title,
        description: product.description,
        imageUrl: firstUploadedImageUrl,
        tags: existingProduct?.tags,
        locale: 'fa', // Default to Persian for Iranian marketplace
      });

      if (enhancement.enhanced) {
        console.log(
          `✅ Non-AI processing successful for product ${product.id}`
        );

        // Handle resized image if available
        if (
          enhancement.imageUrl &&
          enhancement.imageUrl !== firstUploadedImageUrl
        ) {
          enhancedImageUrl = enhancement.imageUrl;

          // Insert resized image as the first image
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
            // Push existing images down
            for (let i = 0; i < existingImages.length; i++) {
              await tx.listingImage.update({
                where: { id: existingImages[i].id },
                data: { sortOrder: i + 1 },
              });
            }
          });
          console.log(`✅ Resized image saved`);
        }

        // Update product with translations and tags
        if (enhancement.title || enhancement.tags) {
          const enhancedTitle = enhancement.title || product.title;
          enhancedDescription = enhancement.description || product.description;

          // Store tags as an object with language keys
          const tagsToStore =
            enhancement.tagsEn && enhancement.tagsEn.length > 0
              ? { fa: enhancement.tagsFa || [], en: enhancement.tagsEn }
              : enhancement.tags; // Keep as simple array if no English tags

          await prisma.product.update({
            where: { id: product.id },
            data: {
              title: enhancedTitle,
              description: enhancedDescription,
              tags: tagsToStore,
            },
          });
          console.log(`✅ Translations and tags saved`);

          // Save English translation
          if (enhancement.descriptionEn || enhancement.titleEn) {
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
                    title: enhancement.titleEn || existingTranslation.title,
                    description:
                      enhancement.descriptionEn ||
                      existingTranslation.description,
                  },
                });
                console.log(`✅ Updated English translation`);
              } else {
                // Create new translation
                await prisma.productTranslation.create({
                  data: {
                    productId: product.id,
                    locale: 'en',
                    title: enhancement.titleEn || product.title,
                    description:
                      enhancement.descriptionEn || product.description,
                  },
                });
                console.log(`✅ Created English translation`);
              }
            } catch (translationError) {
              console.error('Translation save failed:', translationError);
              Sentry.captureException(translationError);
              // Don't fail the whole process if translation save fails
            }
          }

          // Update progress
          await prisma.product.update({
            where: { id: product.id },
            data: {
              eligibilityReasons: getBilingualProgress('enhancementComplete'),
            },
          });
        }
      } else {
        console.log(
          `⚠️ Non-AI processing returned false for product ${product.id}`
        );

        // Update progress even if processing didn't make changes
        await prisma.product.update({
          where: { id: product.id },
          data: {
            eligibilityReasons: getBilingualProgress('enhancementSkipped'),
          },
        });
      }
    } catch (nonAIError) {
      // Log detailed non-AI processing error
      console.error('❌ Non-AI processing failed:', nonAIError);
      Sentry.captureException(nonAIError, {
        extra: {
          productId: product.id,
          hasImage: !!firstUploadedImageUrl,
          userId,
        },
      });
      // Continue with original content if non-AI processing fails

      // Still update progress to step3 to continue with assessment
      await prisma.product.update({
        where: { id: product.id },
        data: {
          eligibilityReasons: getBilingualProgress('step3'),
        },
      });
    }
  }

  // STEP 2: Assess the (potentially enhanced) product for eligibility
  try {
    // Update status to show assessment is starting
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityReasons: getBilingualProgress('step3'),
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
