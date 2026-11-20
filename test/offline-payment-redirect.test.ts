import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { loadRoute } from './helpers/load-route';

type Handler = (request: NextRequest) => Promise<NextResponse>;

async function main() {
  const orderId = 'syntheticorder';
  let paymentStatus = 'PENDING';
  let paymentGateway = 'OFFLINE';
  const adapter = {
    gateway: 'OFFLINE',
    create: async () => ({
      redirectUrl: 'http://localhost/checkout/synthetic',
    }),
    verify: () => assert.fail('Offline redirects must not call a gateway'),
  };
  const bypass = (handler: Handler) => handler;
  const withRateLimit = (_limiter: unknown, handler: Handler) => handler;
  const { GET } = loadRoute<{ GET: Handler }>(
    'app/api/payments/callback/route.ts',
    {
      'next/server': { NextResponse },
      'next/headers': {
        cookies: async () => ({ get: () => ({ value: 'en' }) }),
      },
      '@prisma/client': {},
      '@/lib/prisma': {
        prisma: {
          payment: {
            findUnique: async () => ({
              orderId,
              gateway: paymentGateway,
              status: paymentStatus,
            }),
            update: () =>
              assert.fail('Offline redirects must not update payment state'),
          },
          $transaction: () =>
            assert.fail('Offline redirects must not run a transaction'),
        },
      },
      '@/lib/payments': { adapter },
      '@/lib/email': {},
      '@/lib/rateLimit': { withRateLimit },
      '@sentry/nextjs': {
        captureException: (error: unknown) => assert.fail(String(error)),
      },
      '@/lib/email-templates/OrderReceiptEmail': {},
      '@/lib/notifications': {},
      '@/lib/orderStock': {},
      '@/lib/payment-signature': {},
    }
  );
  for (const state of ['INITIATED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']) {
    paymentStatus = state;
    const response = await GET(
      new NextRequest(
        `http://localhost/api/payments/callback?orderId=${orderId}`
      )
    );
    const redirect = new URL(response.headers.get('location')!);
    assert.equal(redirect.searchParams.get('orderId'), orderId);
    assert.equal(
      redirect.pathname,
      state === 'PAID' ? '/en/order/success' : '/en/order/failed'
    );
    assert.equal(
      redirect.searchParams.get('reason'),
      state === 'INITIATED' || state === 'PENDING'
        ? 'manual'
        : state === 'PAID'
          ? null
          : 'verification_failed'
    );
  }
  paymentGateway = 'ZARINPAL';
  paymentStatus = 'PENDING';
  const mismatch = await GET(
    new NextRequest(`http://localhost/api/payments/callback?orderId=${orderId}`)
  );
  assert.equal(
    new URL(mismatch.headers.get('location')!).searchParams.get('reason'),
    'verification_failed'
  );

  const { POST } = loadRoute<{ POST: Handler }>(
    'app/api/payments/create/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': {
        auth: async () => ({ user: { email: 'synthetic@example.test' } }),
      },
      '@/lib/prisma': {
        prisma: {
          user: { findUnique: async () => ({ id: 'buyer' }) },
          order: {
            findFirst: async () => ({ totalToman: 2000 }),
            findUnique: async () => ({ status: 'PENDING' }),
          },
          orderItem: { findMany: async () => [] },
          payment: {
            findUnique: async () => null,
            create: async ({
              data,
            }: {
              data: { status: string; gateway: string; orderId: string };
            }) => {
              assert.equal(data.gateway, 'OFFLINE');
              assert.equal(data.status, 'PENDING');
              assert.equal(data.orderId, orderId);
              return { id: 'synthetic-payment' };
            },
          },
        },
      },
      '@/lib/payments': { adapter },
      '@/lib/csrf': { withCSRF: bypass },
      '@/lib/rateLimit': { withRateLimit },
      '@/lib/orderPreflight': { collectPreflightIssues: () => [] },
      '@/lib/paymentsPreflight': {},
      '@/lib/validation': {
        parseOrderId: (id: unknown) => {
          assert.equal(id, orderId);
          return id;
        },
      },
      '@/lib/payment-monitor': {
        checkPaymentPatterns: async () => ({ suspicious: false }),
      },
      '@sentry/nextjs': {
        setUser: () => {},
        captureException: (error: unknown) => assert.fail(String(error)),
      },
    }
  );
  const created = await POST(
    new NextRequest('http://localhost/api/payments/create', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    })
  );
  assert.equal(created.status, 200);
  assert.equal(
    (await created.json()).redirectUrl,
    'http://localhost/checkout/synthetic'
  );
  console.log(
    '✓ Offline payment starts pending and customer redirects leave saved payment state alone'
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
