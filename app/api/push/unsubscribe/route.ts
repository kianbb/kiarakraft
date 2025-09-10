import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { withCSRF } from '@/lib/csrf';

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await request.json();
      const { endpoint } = unsubscribeSchema.parse(body);

      // Delete subscription for this user and endpoint
      await prisma.pushSubscription.deleteMany({
        where: {
          userId: session.user.id,
          endpoint,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 400 });
      }
      console.error('Error removing push subscription:', error);
      return NextResponse.json(
        { error: 'Failed to remove subscription' },
        { status: 500 }
      );
    }
  })
);
