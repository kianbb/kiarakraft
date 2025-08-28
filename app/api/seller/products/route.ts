import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductForHandcrafted } from '@/lib/moderation';
import { withRateLimit, orderRateLimit } from '@/lib/rateLimit';
import {
  sanitizeAndValidate,
  SanitizationLevel,
} from '@/lib/input-sanitization';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';

export const GET = withRateLimit(
  orderRateLimit,
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
      const limit = searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : undefined;

      const products = await prisma.product.findMany({
        where: { sellerId: user.id },
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
  orderRateLimit,
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

      const data = await request.json();

      // Comprehensive input validation and sanitization
      const titleValidation = sanitizeAndValidate(data.name || '', {
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
        data.description || '',
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
          where: { slug: data.category },
        });
        categoryId = cat?.id;
      }

      const isVerified = !!user.sellerProfile.verified;

      const product = await prisma.product.create({
        data: {
          title: titleValidation.sanitized,
          description: descriptionValidation.sanitized,
          priceToman: data.price,
          stock: data.stock,
          slug: data.slug || generateSlug(data.name),
          categoryId,
          sellerId: user.id,
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
            alt: img.alt || data.name,
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

      // Handcrafted eligibility assessment (best-effort, async)
      assessProductForHandcrafted({
        title: product.title,
        description: product.description,
        categorySlug: data.category || undefined,
      })
        .then(async res => {
          try {
            await prisma.product.update({
              where: { id: product.id },
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
          }
        })
        .catch(e => console.error('Eligibility error', e));

      return NextResponse.json(product);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error creating product:', error);
      return NextResponse.json(
        { error: 'Failed to create product' },
        { status: 500 }
      );
    }
  }
);

function generateSlug(input: string) {
  return (
    input
      .toString()
      .trim()
      .toLowerCase()
      // Replace Persian spaces and punctuation too
      .replace(/[\s\u200c]+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/\-+/g, '-')
      .replace(/^\-+|\-+$/g, '')
  );
}
