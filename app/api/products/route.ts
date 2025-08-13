import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'newest';

    const where: any = {
      active: true,
    };

    // Add search filter
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Add category filter
    if (category) {
      where.category = {
        slug: category
      };
    }

    // Determine sort order
    let orderBy: any = { createdAt: 'desc' }; // newest (default)
    switch (sort) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'price_low':
        orderBy = { priceToman: 'asc' };
        break;
      case 'price_high':
        orderBy = { priceToman: 'desc' };
        break;
      case 'popular':
        orderBy = { createdAt: 'desc' }; // fallback since no views field
        break;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        seller: true,
        category: true,
        images: true
      },
      orderBy,
      take: 50 // Limit to 50 products
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}