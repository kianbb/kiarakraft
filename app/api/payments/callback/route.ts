import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, paymentRateLimit } from '@/lib/rateLimit';
import { orderIdSchema } from '@/lib/validation';

async function resolveLocale(request: NextRequest): Promise<'fa' | 'en'> {
  try {
    const referer = request.headers.get('referer');
    const locale = referer && new URL(referer).pathname.split('/')[1];
    if (locale === 'fa' || locale === 'en') return locale;
  } catch {}
  try {
    const locale = (await cookies()).get('NEXT_LOCALE')?.value;
    if (locale === 'fa' || locale === 'en') return locale;
  } catch {}
  return 'fa';
}

export const GET = withRateLimit(
  paymentRateLimit,
  async function (request: NextRequest) {
    const locale = await resolveLocale(request);
    function redirect(
      page: 'failed' | 'success',
      reason?: string,
      orderId?: string
    ) {
      const params = new URLSearchParams();
      if (orderId) params.set('orderId', orderId);
      if (reason) params.set('reason', reason);
      const path = '/' + locale + '/order/' + page;
      return new Response(null, {
        status: 307,
        headers: {
          Location: params.size ? path + '?' + params.toString() : path,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const { searchParams } = new URL(request.url);
    if (
      searchParams.has('Authority') ||
      searchParams.has('Status') ||
      searchParams.has('provider') ||
      request.headers.has('x-provider')
    ) {
      return redirect('failed', 'verification_failed');
    }
    const parsed = orderIdSchema.safeParse(searchParams.get('orderId'));
    if (!parsed.success) return redirect('failed', 'invalid_parameters');

    try {
      const userId = (await auth())?.user?.id;
      if (!userId) return redirect('failed', 'payment_not_found');

      // Read the saved outcome for this buyer. Only the admin confirmation
      // flow may change an offline payment or its order.
      const payment = await prisma.payment.findFirst({
        where: {
          orderId: parsed.data,
          gateway: 'OFFLINE',
          order: { userId },
        },
        select: { status: true },
      });
      if (!payment) return redirect('failed', 'payment_not_found');
      if (payment.status === 'PAID') {
        return redirect('success', undefined, parsed.data);
      }

      const awaitingConfirmation =
        payment.status === 'INITIATED' || payment.status === 'PENDING';
      return redirect(
        'failed',
        awaitingConfirmation ? 'manual' : 'verification_failed',
        parsed.data
      );
    } catch {
      console.error('Error reading offline payment status.');
      return redirect('failed', 'callback_error');
    }
  }
);

// Keep external callbacks unavailable until a verified provider flow can
// finalize the payment, order and stock together.
export async function POST() {
  return NextResponse.json(
    { error: 'External payment callbacks are unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
