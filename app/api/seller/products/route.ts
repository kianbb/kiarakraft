import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductForHandcrafted } from '@/lib/moderation';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

  const products = await prisma.product.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching seller products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await request.json();
    // Basic input guardrails
    if ((data.name?.length || 0) > 200 || (data.description?.length || 0) > 5000) {
      return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }
    // Reject descriptions that look like spammy URLs or scripts
    const suspicious = /<script|https?:\/\//i.test(data.description || '') || /(?:viagra|casino|bet)/i.test(data.description || '');
    if (suspicious) {
      return NextResponse.json({ error: 'Content not allowed' }, { status: 400 });
    }

    // Resolve categoryId by slug (optional)
    let categoryId: string | undefined;
    if (data.category) {
      const cat = await prisma.category.findUnique({ where: { slug: data.category } });
      categoryId = cat?.id;
    }

  const product = await prisma.product.create({
      data: {
        title: data.name,
        description: data.description,
        priceToman: data.price,
        stock: data.stock,
        slug: data.slug || generateSlug(data.name),
        categoryId,
        sellerId: user.id,
    active: true
      }
    });

    if (data.imageUrl) {
      await prisma.listingImage.create({
        data: { productId: product.id, url: data.imageUrl, alt: data.name, sortOrder: 0 }
      });
    }

    // Fire-and-forget translation to English from Persian
    // If the source looks Persian, translate to EN; otherwise skip
    const hasPersian = /[\u0600-\u06FF]/.test(product.title) || /[\u0600-\u06FF]/.test(product.description);
    if (hasPersian) {
      const hash = crypto.createHash('sha1').update(product.title + '|' + product.description).digest('hex');
      // Best-effort; don't block response
      translateProductFields(
        { title: product.title, description: product.description },
        'fa',
        'en'
      )
      .then(async (en) => {
        try {
          const client: any = prisma as any;
          await client.productTranslation.upsert({
            where: { productId_locale: { productId: product.id, locale: 'en' } },
            create: { productId: product.id, locale: 'en', title: en.title, description: en.description, sourceHash: hash },
            update: { title: en.title, description: en.description, sourceHash: hash }
          });
        } catch (e) {
          console.error('Failed to store EN translation', e);
        }
      })
      .catch((e) => console.error('Translation error', e));
    }

    // Handcrafted eligibility assessment (best-effort, async)
  assessProductForHandcrafted({
      title: product.title,
      description: product.description,
      categorySlug: data.category || undefined
    }).then(async (res) => {
      try {
    const client: any = prisma as any;
    await client.product.update({
          where: { id: product.id },
          data: {
            eligibilityStatus: res.status,
            eligibilityConfidence: res.confidence ?? null,
            eligibilityReasons: res.reasons?.join('; ').slice(0, 1000) || null
          }
        });
      } catch (e) {
        console.error('Failed to update eligibility', e);
      }
    }).catch((e) => console.error('Eligibility error', e));

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    );
  }
}

function generateSlug(input: string) {
  return input
    .toString()
    .trim()
    .toLowerCase()
    // Replace Persian spaces and punctuation too
    .replace(/[\s\u200c]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^\-+|\-+$/g, '');
}