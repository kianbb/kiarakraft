import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { createHash } from 'crypto';
import * as Sentry from '@sentry/nextjs';

export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      Sentry.setUser({ email: session.user.email });

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { sellerProfile: true },
      });

      if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
        return NextResponse.json(
          { error: 'Seller profile required' },
          { status: 403 }
        );
      }

      const body = await request.json();
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

      // Validate required fields
      if (
        !shopName ||
        !displayName ||
        !bio ||
        !phone ||
        !province ||
        !city ||
        !address ||
        !nationalId
      ) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'All required fields must be provided',
          },
          { status: 400 }
        );
      }

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

        const invalid = docs.find(
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

      // Create secure hash of national ID (never store raw ID)
      const nationalIdHash = createHash('sha256')
        .update(nationalId + process.env.NEXTAUTH_SECRET) // Salt with app secret
        .digest('hex');

      // Update seller profile with onboarding data
      const updatedProfile = await prisma.sellerProfile.update({
        where: { id: user.sellerProfile.id },
        data: {
          shopName: shopName.trim(),
          displayName: displayName.trim(),
          bio: bio.trim(),
          website: website?.trim() || null,
          phone: phone.trim(),
          province: province.trim(),
          city: city.trim(),
          address: address.trim(),
          nationalIdHash,
          // Verification status remains false until admin approval
          verified: false,
          verificationNotes: `Onboarding completed on ${new Date().toISOString()}. Documents uploaded: ${uploadedDocs?.length || 0}`,
        },
      });

      // Log the onboarding completion for admin review
      console.log(
        `Seller onboarding completed: ${user.email} (${updatedProfile.shopName})`
      );

      return NextResponse.json({
        success: true,
        message:
          'Onboarding completed successfully. Your profile is pending verification.',
        profile: {
          id: updatedProfile.id,
          shopName: updatedProfile.shopName,
          verified: updatedProfile.verified,
        },
      });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to complete onboarding' },
        { status: 500 }
      );
    }
  })
);
