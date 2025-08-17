import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { createHash } from 'crypto';

export const POST = withRateLimit(authRateLimit, withCSRF(async function(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { sellerProfile: true }
    });

    if (!user || user.role !== 'SELLER' || !user.sellerProfile) {
      return NextResponse.json({ error: 'Seller profile required' }, { status: 403 });
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
      uploadedDocs
    } = body;

    // Validate required fields
    if (!shopName || !displayName || !bio || !phone || !province || !city || !address || !nationalId) {
      return NextResponse.json({ 
        error: 'All required fields must be provided' 
      }, { status: 400 });
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
      }
    });

    // Log the onboarding completion for admin review
    console.log(`Seller onboarding completed: ${user.email} (${updatedProfile.shopName})`);

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully. Your profile is pending verification.',
      profile: {
        id: updatedProfile.id,
        shopName: updatedProfile.shopName,
        verified: updatedProfile.verified,
      }
    });

  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}));