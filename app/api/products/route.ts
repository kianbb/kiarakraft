import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PrismaWhereClause, PrismaOrderBy } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'newest';

    const where: PrismaWhereClause = {
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
    let orderBy: PrismaOrderBy = { createdAt: 'desc' }; // newest (default)
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
        images: true,
        // @ts-ignore Prisma will have this after migration
        translations: true
      },
      orderBy,
      take: 50 // Limit to 50 products
    });

    const locale = (new URL(request.url)).searchParams.get('locale') || 'fa';
  let mapped = products.map((p: any) => {
      if (locale === 'en' && Array.isArray(p.translations)) {
        const en = p.translations.find((t: any) => t.locale === 'en');
        if (en) return { ...p, title: en.title, description: en.description };
      }
      return p;
    });

  // Soft-filter: hide non-handcrafted items if eligibilityStatus is present and REJECTED
  mapped = mapped.filter((p: any) => !p.eligibilityStatus || p.eligibilityStatus !== 'REJECTED');

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}