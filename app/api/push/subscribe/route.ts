import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const POST = withRateLimit(
  authRateLimit,
  async function (request: NextRequest) {
    try {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Check if VAPID keys are configured
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        return NextResponse.json(
          { error: 'Push notifications not configured' },
          { status: 503 }
        );
      }

      const body = await request.json();
      const { endpoint, keys } = subscriptionSchema.parse(body);

      // Upsert subscription (update if exists, create if new)
      const subscription = await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        create: {
          userId: session.user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      });

      return NextResponse.json({ success: true, id: subscription.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 400 });
      }
      console.error('Error creating push subscription:', error);
      return NextResponse.json(
        { error: 'Failed to create subscription' },
        { status: 500 }
      );
    }
  }
);

// Get VAPID public key for client-side subscription
export const GET = async function () {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json(
      { error: 'Push notifications not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
};
