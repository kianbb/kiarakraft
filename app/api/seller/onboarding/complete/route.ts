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

      // uploadedDocs: optional but if present must be an array of strict Cloudinary doc URLs (<=5)
      const docs: unknown = uploadedDocs;
      if (docs !== undefined) {
        if (!Array.isArray(docs)) {
          return NextResponse.json(
            {
              error: 'VALIDATION_ERROR',
              message: 'uploadedDocs must be an array',
            },
            { status: 400 }
          );
        }
        if (docs.length > 5) {
          return NextResponse.json(
            {
              error: 'VALIDATION_ERROR',
              message: 'A maximum of 5 documents is allowed',
            },
            { status: 400 }
          );
        }

        const sellerId = user.sellerProfile.id;
        const isValidDocUrl = (u: string): boolean => {
          try {
            const url = new URL(u);
            if (url.protocol !== 'https:') return false;
            if (url.hostname !== 'res.cloudinary.com') return false; // exact host match
            // Path segments e.g.: /<cloud>/image/upload/v123/kiarakraft/sellers/<id>/documents/filename.pdf
            const segments = url.pathname.split('/').filter(Boolean);
            const sellersIdx = segments.indexOf('sellers');
            if (sellersIdx === -1) return false;
            if (segments[sellersIdx + 1] !== sellerId) return false;
            if (segments[sellersIdx + 2] !== 'documents') return false;
            return true;
          } catch {
            return false;
          }
        };

        const invalid = docs.some(
          u => typeof u !== 'string' || !isValidDocUrl(u)
        );
        if (invalid) {
          return NextResponse.json(
            {
              error: 'VALIDATION_ERROR',
              message:
                'uploadedDocs must be HTTPS Cloudinary URLs within your documents folder',
            },
            { status: 400 }
          );
        }
      }

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
