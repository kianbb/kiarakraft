import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, sellerRateLimit } from '@/lib/rateLimit';
import { revalidateSeller, revalidateProductsForSeller } from '@/lib/cache';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { withCSRF } from '@/lib/csrf';

export const GET = withRateLimit(sellerRateLimit, async function GET() {
  try {
    const session = await auth();

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
  withCSRF(async function PUT(request: NextRequest) {
    try {
      const session = await auth();

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

      const body = await request.json();

      // V3-S1: Server-side validation (handle required pattern if provided)
      const schema = z.object({
        handle: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-z0-9-]{3,30}$/)
          .optional(),
        shopName: z.string().optional(),
        displayName: z.string().optional(),
        bio: z.string().max(500).optional().nullable(),
        avatarUrl: z.string().url().optional().nullable(),
        bannerUrl: z.string().url().optional().nullable(),
        phone: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        website: z.string().url().optional().nullable(),
      });

      let data: z.infer<typeof schema>;
      try {
        data = schema.parse(body);
      } catch (e) {
        if (e instanceof z.ZodError) {
          return NextResponse.json(
            { error: 'Validation failed', issues: e.issues },
            { status: 400 }
          );
        }
        throw e;
      }

      // Normalize handle to lowercase if present
      if (data.handle) data.handle = data.handle.toLowerCase();

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
      const fallbackHandle = `shop-${user.id.slice(0, 8)}`;
      const updatedProfile = await prisma.sellerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          handle: data.handle || fallbackHandle,
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

      // Revalidate caches related to this seller (storefront + their products)
      try {
        await revalidateSeller(updatedProfile.id);
        await revalidateProductsForSeller(updatedProfile.id);
      } catch (e) {
        console.warn('Cache revalidation (seller) failed:', e);
      }

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
  })
);
