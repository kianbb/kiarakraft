import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import SellerVerificationEmail from '@/lib/email-templates/SellerVerificationEmail';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimit';

export const POST = withRateLimit(
  adminRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await getServerSession(authOptions);

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

      const body = await request.json();
      const { sellerId, action, notes } = body;

      // Validate input
      if (!sellerId || typeof sellerId !== 'string') {
        return NextResponse.json(
          { error: 'Invalid seller ID' },
          { status: 400 }
        );
      }

      if (!action || !['verify', 'reject'].includes(action)) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      if (!notes || typeof notes !== 'string' || notes.trim().length < 5) {
        return NextResponse.json(
          {
            error: 'Notes are required (minimum 5 characters)',
          },
          { status: 400 }
        );
      }

      // Find seller profile
      const sellerProfile = await prisma.sellerProfile.findUnique({
        where: { id: sellerId },
        include: {
          user: {
            select: { email: true, name: true },
          },
        },
      });

      if (!sellerProfile) {
        return NextResponse.json(
          { error: 'Seller not found' },
          { status: 404 }
        );
      }

      // Update verification status
      const updateData = {
        verified: action === 'verify',
        verificationNotes: notes.trim(),
        verifiedAt: action === 'verify' ? new Date() : null,
        // Only attribute verification to the admin when action is 'verify'
        verifiedBy: action === 'verify' ? adminUser.email : null,
      };

      const updatedProfile = await prisma.sellerProfile.update({
        where: { id: sellerId },
        data: updateData,
      });

      // Log the action for audit trail
      console.log(
        `Admin verification action: ${adminUser.email} ${action}ed seller ${sellerProfile.user.email} (${sellerProfile.shopName}). Notes: ${notes}`
      );

      // Notify seller via email (best-effort)
      try {
        const emailLocale: 'fa' | 'en' = 'fa';
        await sendEmail({
          to: sellerProfile.user.email,
          subject:
            action === 'verify'
              ? 'تایید فروشندگی شما در کیارا کرافت'
              : 'نتیجه بررسی فروشندگی در کیارا کرافت',
          react: SellerVerificationEmail({
            sellerName:
              sellerProfile.user.name || sellerProfile.user.email.split('@')[0],
            shopName: updatedProfile.shopName,
            action: action as 'verify' | 'reject',
            notes: notes,
            locale: emailLocale,
            dashboardUrl: 'https://www.kiarakraft.com/fa/seller',
          }),
        });
      } catch (mailErr) {
        console.error('Failed to send seller verification email:', mailErr);
      }

      return NextResponse.json({
        success: true,
        message: `Seller ${action}ed successfully`,
        seller: {
          id: updatedProfile.id,
          shopName: updatedProfile.shopName,
          verified: updatedProfile.verified,
          verifiedAt: updatedProfile.verifiedAt,
        },
      });
    } catch (error) {
      console.error('Error verifying seller:', error);
      return NextResponse.json(
        { error: 'Failed to update seller verification' },
        { status: 500 }
      );
    }
  })
);
