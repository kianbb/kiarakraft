import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import {
  DOCUMENT_ID,
  isReadyDocument,
  SellerDocumentError,
} from '@/lib/seller-documents';
import { downloadPrivateDocument } from '@/lib/seller-document-provider';

export const GET = withRateLimit(
  adminRateLimit,
  withCSRF(async function (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; documentId: string }> }
  ) {
    const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    };
    try {
      const session = await auth();
      if (!session?.user?.email)
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401, headers }
        );
      const admin = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true },
      });
      if (admin?.role !== 'ADMIN')
        return NextResponse.json(
          { error: 'Admin required' },
          { status: 403, headers }
        );
      const { id, documentId } = await params;
      if (!DOCUMENT_ID.test(id) || !DOCUMENT_ID.test(documentId))
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404, headers }
        );
      const doc = await prisma.sellerDocument.findFirst({
        where: { id: documentId, sellerId: id },
      });
      if (!doc)
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404, headers }
        );
      if (!isReadyDocument(doc))
        return NextResponse.json(
          { error: 'DOCUMENT_UNAVAILABLE' },
          { status: 409, headers }
        );
      const result = await downloadPrivateDocument(doc);
      return new Response(Uint8Array.from(result.buffer), {
        headers: {
          ...headers,
          'Content-Type': result.mime,
          'Content-Disposition': `attachment; filename="verification-document.${result.extension}"`,
          'Content-Length': String(result.buffer.length),
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'DOCUMENT_UNAVAILABLE' },
        {
          status: error instanceof SellerDocumentError ? error.status : 503,
          headers,
        }
      );
    }
  })
);
