import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Prisma Client type lacks generated types for ProductTranslation in CI; use a narrow escape hatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = prisma;
    const [totalProducts, enTranslations] = await Promise.all([
      client.product.count(),
      client.productTranslation.count({ where: { locale: 'en' } })
    ]);

  const missing = await client.product.findMany(({
      where: {
        active: true,
        NOT: { translations: { some: { locale: 'en' } } }
      },
      select: { id: true, slug: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 10
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown) as any);

    return NextResponse.json({
      totalProducts,
      enTranslations,
      missingCount: Math.max(totalProducts - enTranslations, 0),
      sampleMissing: missing,
      env: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
