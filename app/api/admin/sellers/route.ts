import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function privateJson(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.role !== 'ADMIN') {
      return privateJson(
        { error: 'Access denied - Admin required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '50')),
      100
    );
    const offset = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      prisma.sellerProfile.findMany({
        select: {
          id: true,
          shopName: true,
          displayName: true,
          bio: true,
          phone: true,
          province: true,
          city: true,
          address: true,
          website: true,
          verified: true,
          verificationNotes: true,
          verifiedAt: true,
          verifiedBy: true,
          createdAt: true,
          docsFolder: true,
          _count: { select: { documents: true } },
          user: { select: { email: true, name: true } },
        },
        orderBy: [
          { verified: 'asc' }, // Unverified first
          { createdAt: 'desc' },
        ],
        skip: offset,
        take: limit,
      }),
      prisma.sellerProfile.count(),
    ]);

    const stats = {
      total,
      pending: await prisma.sellerProfile.count({ where: { verified: false } }),
      verified: await prisma.sellerProfile.count({ where: { verified: true } }),
    };

    return privateJson({
      sellers: sellers.map(({ docsFolder, _count, ...seller }) => ({
        ...seller,
        hasDocuments: docsFolder !== null || _count.documents > 0,
      })),
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch {
    console.error('Seller list unavailable');
    return privateJson({ error: 'Failed to fetch sellers' }, { status: 500 });
  }
}
