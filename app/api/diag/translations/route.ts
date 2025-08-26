import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  // Only allow in development or for admin users
  if (process.env.NODE_ENV === 'production') {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Translation diagnostics access denied' },
        { status: 403 }
      );
    }
  }

  try {
    // Prisma Client type lacks generated types for ProductTranslation in CI; use a narrow escape hatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = prisma;
    const [totalProducts, enTranslations] = await Promise.all([
      client.product.count(),
      client.productTranslation.count({ where: { locale: 'en' } }),
    ]);

    // Don't expose sensitive product data, just counts
    return NextResponse.json({
      totalProducts,
      enTranslations,
      missingCount: Math.max(totalProducts - enTranslations, 0),
      translationCoverage:
        totalProducts > 0
          ? ((enTranslations / totalProducts) * 100).toFixed(1)
          : '0.0',
    });
  } catch {
    return NextResponse.json(
      { error: 'Translation check failed' },
      { status: 500 }
    );
  }
}
