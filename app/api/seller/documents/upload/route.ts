import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, uploadRateLimit } from '@/lib/rateLimit';
import { isStagingDeployment } from '@/lib/deployment-policy';
import { readDocumentFile, SellerDocumentError } from '@/lib/seller-documents';
import {
  reserveDocument,
  finalizeDocument,
  failDocument,
} from '@/lib/seller-document-store';
import {
  uploadPrivateDocument,
  assertDocumentProviderConfigured,
  assertDocumentCollectionEnabled,
} from '@/lib/seller-document-provider';

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

export const POST = withRateLimit(
  uploadRateLimit,
  withCSRF(async function (request: NextRequest) {
    if (isStagingDeployment())
      return privateJson(
        { error: 'Identity document collection is disabled in staging' },
        { status: 403 }
      );
    let reservation: { id: string; sellerId: string } | undefined;
    try {
      const session = await auth();
      if (!session?.user?.email)
        return privateJson({ error: 'Unauthorized' }, { status: 401 });
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          role: true,
          sellerProfile: { select: { id: true } },
        },
      });
      if (user?.role !== 'SELLER' || !user.sellerProfile)
        return privateJson(
          { error: 'Seller profile required' },
          { status: 403 }
        );
      assertDocumentCollectionEnabled();
      assertDocumentProviderConfigured();
      const { buffer, mime } = await readDocumentFile(request);
      reservation = await reserveDocument(
        user.sellerProfile.id,
        mime,
        buffer.length
      );
      await uploadPrivateDocument(
        buffer,
        mime,
        reservation.sellerId,
        reservation.id
      );
      await finalizeDocument(reservation.id, reservation.sellerId);
      return privateJson(
        {
          success: true,
          document: { id: reservation.id, mime, bytes: buffer.length },
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      if (reservation)
        await failDocument(reservation.id, reservation.sellerId).catch(
          () => {}
        );
      if (error instanceof SellerDocumentError)
        return privateJson({ error: error.code }, { status: error.status });
      return privateJson({ error: 'DOCUMENT_UNAVAILABLE' }, { status: 503 });
    }
  })
);
