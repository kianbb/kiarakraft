import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';
import { listAssetsInFolder } from '@/lib/cloudinary';
import * as Sentry from '@sentry/nextjs';

export const GET = withRateLimit(
  adminRateLimit,
  withCSRF(async function (
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const session = await auth();
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const adminUser = await prisma.user.findUnique({
        where: { email: session.user.email },
      });
      if (!adminUser || adminUser.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Access denied - Admin required' },
          { status: 403 }
        );
      }
      Sentry.setUser({ email: session.user.email });

      const seller = await prisma.sellerProfile.findUnique({
        where: { id: params.id },
      });
      if (!seller) {
        return NextResponse.json(
          { error: 'Seller not found' },
          { status: 404 }
        );
      }

      if (!seller.docsFolder) {
        return NextResponse.json({ documents: [], folder: null });
      }

      const docs = await listAssetsInFolder(seller.docsFolder, 100);
      return NextResponse.json({ documents: docs, folder: seller.docsFolder });
    } catch (error) {
      console.error('Error fetching seller documents:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to fetch seller documents' },
        { status: 500 }
      );
    }
  })
);
