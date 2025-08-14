import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching seller profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await request.json();

    // Update user name
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: data.name
      }
    });

    // Update or create seller profile
    const updatedProfile = await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        shopName: data.shopName || '',
        displayName: data.displayName || data.name,
        bio: data.bio,
        phone: data.phone,
        address: data.address,
        website: data.website
      },
      update: {
        bio: data.bio,
        phone: data.phone,
        address: data.address,
        website: data.website
      }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating seller profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}