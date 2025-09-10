import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withCSRF } from '@/lib/csrf';

const createAddressSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(1, 'Phone is required'),
  country: z.string().min(1, 'Country is required'),
  province: z.string().min(1, 'Province is required'),
  city: z.string().min(1, 'City is required'),
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  postal: z.string().optional(),
  isDefault: z.boolean().default(false),
});

// GET /api/addresses - Get user addresses
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const addresses = await prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json(addresses);
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/addresses - Create new address
export const POST = withCSRF(async function (request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createAddressSchema.parse(body);

    // Check address limit to prevent resource exhaustion
    const addressCount = await prisma.address.count({
      where: { userId: session.user.id },
    });

    const MAX_ADDRESSES_PER_USER = 10;
    if (addressCount >= MAX_ADDRESSES_PER_USER) {
      return NextResponse.json(
        {
          error: `Maximum of ${MAX_ADDRESSES_PER_USER} addresses allowed per user`,
        },
        { status: 400 }
      );
    }

    // If this is being set as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.address.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        ...validatedData,
        userId: session.user.id,
      },
    });

    return NextResponse.json(address, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Error creating address:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
