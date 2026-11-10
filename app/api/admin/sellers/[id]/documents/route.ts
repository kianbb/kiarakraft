import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import { DOCUMENT_ID, documentDto } from '@/lib/seller-documents';

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

export const GET = withRateLimit(
  adminRateLimit,
  withCSRF(async function (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    try {
      const session = await auth();
      if (!session?.user?.email)
        return privateJson({ error: 'Unauthorized' }, { status: 401 });
      const admin = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true },
      });
      if (admin?.role !== 'ADMIN')
        return privateJson({ error: 'Admin required' }, { status: 403 });
      const { id } = await params;
      if (!DOCUMENT_ID.test(id))
        return privateJson({ error: 'Not found' }, { status: 404 });
      const seller = await prisma.sellerProfile.findUnique({
        where: { id },
        select: {
          docsFolder: true,
          _count: { select: { documents: true } },
          documents: {
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              sellerId: true,
              publicId: true,
              mime: true,
              bytes: true,
              createdAt: true,
              resourceType: true,
              deliveryType: true,
              status: true,
            },
          },
        },
      });
      if (!seller) return privateJson({ error: 'Not found' }, { status: 404 });
      return privateJson(
        {
          documents: seller.documents.map(documentDto),
          legacyReconciliationRequired:
            seller.docsFolder !== null ||
            seller._count.documents > seller.documents.length ||
            seller.documents.some(
              doc => doc.deliveryType !== 'authenticated' || doc.status === null
            ),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch {
      return privateJson({ error: 'DOCUMENT_UNAVAILABLE' }, { status: 503 });
    }
  })
);
