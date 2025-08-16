import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';
import { assessProductForHandcrafted } from '@/lib/moderation';
import crypto from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        sellerId: user.id
      }
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    if ((data.title?.length || 0) > 200 || (data.description?.length || 0) > 5000) {
      return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }
    const suspicious = /<script|https?:\/\//i.test(data.description || '') || /(?:viagra|casino|bet)/i.test(data.description || '');
    if (suspicious) {
      return NextResponse.json({ error: 'Content not allowed' }, { status: 400 });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        sellerId: user.id
      }
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: params.id },
      data: {
        title: data.title,
        description: data.description,
        priceToman: data.priceToman,
        stock: data.stock
      }
    });

    // Re-translate EN if source appears Persian
    const hasPersian = /[\u0600-\u06FF]/.test(updatedProduct.title) || /[\u0600-\u06FF]/.test(updatedProduct.description);
    if (hasPersian) {
      const hash = crypto.createHash('sha1').update(updatedProduct.title + '|' + updatedProduct.description).digest('hex');
      translateProductFields({ title: updatedProduct.title, description: updatedProduct.description }, 'fa', 'en')
        .then(async (en) => {
          type PTClient = {
            productTranslation: {
              upsert: (args: {
                where: { productId_locale: { productId: string; locale: string } };
                create: { productId: string; locale: string; title: string; description: string; sourceHash: string };
                update: { title: string; description: string; sourceHash: string };
              }) => Promise<void>;
            };
          };
          const client = prisma as unknown as PTClient;
          await client.productTranslation.upsert({
            where: { productId_locale: { productId: updatedProduct.id, locale: 'en' } },
            create: { productId: updatedProduct.id, locale: 'en', title: en.title, description: en.description, sourceHash: hash },
            update: { title: en.title, description: en.description, sourceHash: hash }
          });
        })
        .catch((e) => console.error('Translation error (update)', e));
    }

    // Update handcrafted eligibility in background (best-effort)
    assessProductForHandcrafted({
      title: updatedProduct.title,
      description: updatedProduct.description,
      categorySlug: undefined
    }).then(async (res) => {
      try {
        await prisma.product.update({
          where: { id: updatedProduct.id },
          data: {
            ...( {
              eligibilityStatus: res.status,
              eligibilityConfidence: res.confidence ?? null,
              eligibilityReasons: res.reasons?.join('; ').slice(0, 1000) || null
            } as Record<string, unknown>)
          }
        });
      } catch (e) {
        console.error('Failed to update eligibility', e);
      }
    }).catch((e) => console.error('Eligibility error (update)', e));

    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        sellerId: user.id
      }
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    await prisma.product.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}