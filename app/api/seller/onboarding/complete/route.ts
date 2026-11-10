import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { isStagingDeployment } from '@/lib/deployment-policy';
import {
  fingerprintNationalId,
  IdentityKeyError,
} from '@/lib/identity-fingerprint';
import { readJsonInput, JsonInputError } from '@/lib/json-input';
import { sellerOnboardingSchema } from '@/lib/seller-onboarding-input';
import { ownedReadyDocuments } from '@/lib/seller-document-store';
import { SellerDocumentError } from '@/lib/seller-documents';

export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    if (isStagingDeployment())
      return NextResponse.json(
        { error: 'Identity collection is disabled in staging' },
        { status: 403 }
      );
    try {
      const session = await auth();

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          role: true,
          sellerProfile: { select: { id: true, nationalIdHash: true } },
        },
      });

      if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
        return NextResponse.json(
          { error: 'Seller profile required' },
          { status: 403 }
        );
      }

      // Existing, legacy and unknown fingerprints all require a separate
      // reviewed re-verification flow; ordinary onboarding cannot replace them.
      if (user.sellerProfile.nationalIdHash !== null) {
        return NextResponse.json(
          { error: 'IDENTITY_ALREADY_RECORDED' },
          { status: 409 }
        );
      }
      const body = await readJsonInput(
        request,
        sellerOnboardingSchema,
        16 * 1024
      );
      const {
        shopName,
        displayName,
        bio,
        website,
        phone,
        province,
        city,
        address,
        nationalId,
        uploadedDocs,
      } = body;

      // Resolve only persisted, authenticated documents belonging to this seller.
      if (uploadedDocs?.length)
        await ownedReadyDocuments(user.sellerProfile.id, uploadedDocs);

      const nationalIdHash = fingerprintNationalId(nationalId);

      // Compare-and-set preserves the first recorded identity even when two
      // submissions pass the initial read concurrently. All profile writes share
      // the ownership and first-write predicate.
      const result = await prisma.sellerProfile.updateMany({
        where: {
          id: user.sellerProfile.id,
          userId: user.id,
          nationalIdHash: null,
        },
        data: {
          shopName,
          displayName,
          bio,
          website: website || null,
          phone,
          province,
          city,
          address,
          nationalIdHash,
          verified: false,
          verificationNotes: `Onboarding completed on ${new Date().toISOString()}. Documents uploaded: ${uploadedDocs?.length || 0}`,
        },
      });
      if (result.count !== 1)
        return NextResponse.json(
          { error: 'IDENTITY_ALREADY_RECORDED' },
          { status: 409 }
        );

      console.log('Seller onboarding completed');

      return NextResponse.json({
        success: true,
        message:
          'Onboarding completed successfully. Your profile is pending verification.',
        profile: {
          id: user.sellerProfile.id,
          shopName,
          verified: false,
        },
      });
    } catch (error) {
      if (error instanceof SellerDocumentError)
        return NextResponse.json(
          { error: error.code },
          { status: error.status }
        );
      if (error instanceof IdentityKeyError)
        return NextResponse.json(
          { error: 'IDENTITY_UNAVAILABLE' },
          { status: 503 }
        );
      if (error instanceof JsonInputError)
        return NextResponse.json(
          { error: 'VALIDATION_ERROR' },
          { status: error.status }
        );
      // Prisma/provider/parser errors can contain submitted identity data.
      console.error('Seller onboarding failed');
      return NextResponse.json(
        { error: 'Failed to complete onboarding' },
        { status: 500 }
      );
    }
  })
);
