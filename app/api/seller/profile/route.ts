import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, sellerRateLimit } from '@/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';

export const GET = withRateLimit(sellerRateLimit, async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        sellerProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Return combined user and seller profile data
    const profileData = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      ...user.sellerProfile,
    };

    return NextResponse.json(profileData);
  } catch (error) {
    console.error('Error fetching seller profile:', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
});

export const PUT = withRateLimit(
  sellerRateLimit,
  async function PUT(request: NextRequest) {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user?.email || session.user.role !== 'SELLER') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      Sentry.setUser({ email: session.user.email });

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
          sellerProfile: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const data = await request.json();

      // V3-S1: Validate handle uniqueness if provided
      if (data.handle) {
        const existingHandle = await prisma.sellerProfile.findUnique({
          where: { handle: data.handle },
        });

        if (existingHandle && existingHandle.userId !== user.id) {
          return NextResponse.json(
            { error: 'Handle already taken. Please choose a different one.' },
            { status: 409 }
          );
        }
      }

      // Update user name if provided
      if (data.displayName) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            name: data.displayName,
          },
        });
      }

      // Update or create seller profile
      const updatedProfile = await prisma.sellerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          handle: data.handle,
          shopName: data.shopName || 'My Shop',
          displayName: data.displayName || user.name || 'Seller',
          bio: data.bio,
          avatarUrl: data.avatarUrl,
          bannerUrl: data.bannerUrl,
          phone: data.phone,
          address: data.address,
          website: data.website,
        },
        update: {
          ...(data.handle !== undefined && { handle: data.handle }),
          ...(data.shopName && { shopName: data.shopName }),
          ...(data.displayName && { displayName: data.displayName }),
          bio: data.bio,
          avatarUrl: data.avatarUrl,
          bannerUrl: data.bannerUrl,
          phone: data.phone,
          address: data.address,
          website: data.website,
        },
      });

      // Return combined data
      const profileData = {
        ...updatedProfile,
        email: user.email,
        name: data.displayName || user.name,
      };

      return NextResponse.json(profileData);
    } catch (error) {
      console.error('Error updating seller profile:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }
  }
);
