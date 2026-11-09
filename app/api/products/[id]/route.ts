import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  publicProductWhere,
  publicProductSelect,
  toPublicProduct,
} from '@/lib/public-product';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    const product = await prisma.product.findFirst({
      where: {
        id,
        ...publicProductWhere,
      },
      select: publicProductSelect,
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(
      toPublicProduct(
        product,
        new URL(request.url).searchParams.get('locale') || 'fa'
      )
    );
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
}
