import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { OfflineAdapter } from '../lib/payments/adapters/offline';
import { orderIdSchema } from '../lib/validation';
import { loadRoute } from './helpers/load-route';

type Handler = (request: NextRequest) => Promise<Response>;

async function main() {
  const orderId = 'syntheticorder';
  let paymentStatus = 'PENDING';
  let paymentGateway = 'OFFLINE';
  let sessionUserId: string | undefined = 'buyer';
  let callbackReads = 0;
  const bypass = (handler: Handler) => handler;
  const withRateLimit = (_limiter: unknown, handler: Handler) => handler;
  const { GET, POST: webhook } = loadRoute<{ GET: Handler; POST: Handler }>(
    'app/api/payments/callback/route.ts',
    {
      'next/server': { NextResponse },
      'next/headers': {
        cookies: async () => ({ get: () => ({ value: 'en' }) }),
      },
      '@/lib/auth': {
        auth: async () =>
          sessionUserId ? { user: { id: sessionUserId } } : null,
      },
      '@/lib/prisma': {
        prisma: {
          payment: {
            findFirst: async ({
              where,
              select,
            }: {
              where: {
                orderId: string;
                gateway: string;
                order: { userId: string };
              };
              select: { status: boolean };
            }) => {
              callbackReads++;
              assert.equal(where.orderId, orderId);
              assert.equal(where.order.userId, sessionUserId);
              assert.equal(where.gateway, 'OFFLINE');
              assert.equal(select.status, true);
              return where.order.userId === 'buyer' &&
                where.gateway === paymentGateway
                ? { status: paymentStatus }
                : null;
            },
            update: () =>
              assert.fail('Offline redirects must not update payment state'),
          },
          $transaction: () =>
            assert.fail('Offline redirects must not run a transaction'),
        },
      },
      '@/lib/rateLimit': { withRateLimit },
      '@/lib/validation': { orderIdSchema },
    },
    { globals: { Response } }
  );
  const callbackPath = '/api/payments/callback?orderId=' + orderId;
  const callbackUrl = 'https://checkout.example.invalid' + callbackPath;
  for (const state of ['INITIATED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']) {
    paymentStatus = state;
    const response = await GET(new NextRequest(callbackUrl));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const location = response.headers.get('location')!;
    assert.match(location, /^\/en\/order\//);
    const redirect = new URL(location, callbackUrl);
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
  paymentStatus = 'PAID';
  const external = await GET(new NextRequest(callbackUrl));
  const externalPath = external.headers.get('location')!;
  const externalLocation = new URL(externalPath, callbackUrl);
  assert.equal(externalLocation.pathname, '/en/order/failed');
  assert.equal(
    externalLocation.searchParams.get('reason'),
    'payment_not_found'
  );
  assert.equal(externalLocation.searchParams.get('orderId'), null);

  paymentGateway = 'OFFLINE';
  sessionUserId = 'other-buyer';
  const unowned = await GET(new NextRequest(callbackUrl));
  assert.equal(unowned.headers.get('location'), externalPath);
  const readsBeforeDenials = callbackReads;
  sessionUserId = undefined;
  const anonymous = await GET(new NextRequest(callbackUrl));
  assert.equal(anonymous.headers.get('location'), externalPath);
  sessionUserId = 'buyer';
  const providerRedirect = await GET(
    new NextRequest(`${callbackUrl}&provider=external`)
  );
  assert.equal(
    new URL(
      providerRedirect.headers.get('location')!,
      callbackUrl
    ).searchParams.get('reason'),
    'verification_failed'
  );
  const unavailable = await webhook(
    new NextRequest(callbackUrl, { method: 'POST' })
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.equal(callbackReads, readsBeforeDenials);

  let configuredAdapter: typeof OfflineAdapter | null = OfflineAdapter;
  let checkoutReads = 0;
  let checkoutWrites = 0;
  const { POST } = loadRoute<{ POST: Handler }>(
    'app/api/payments/create/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': {
        auth: async () => ({ user: { email: 'synthetic@example.test' } }),
      },
      '@/lib/prisma': {
        prisma: {
          user: {
            findUnique: async () => {
              checkoutReads++;
              return { id: 'buyer' };
            },
          },
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
              checkoutWrites++;
              return { id: 'synthetic-payment' };
            },
          },
        },
      },
      '@/lib/payments': { getOfflinePaymentAdapter: () => configuredAdapter },
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
    },
    {
      env: {
        PUBLIC_APP_BASE: 'https://other.example.invalid',
        ALLOWED_APP_BASE_HOSTS: 'other.example.invalid',
      },
    }
  );
  const checkoutRequest = () =>
    new NextRequest('http://localhost/api/payments/create', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  const created = await POST(checkoutRequest());
  assert.equal(created.status, 200);
  assert.equal((await created.json()).redirectUrl, callbackPath + '&ok=1');
  configuredAdapter = null;
  const disabled = await POST(checkoutRequest());
  assert.equal(disabled.status, 503);
  assert.equal(checkoutReads, 1);

  configuredAdapter = {
    ...OfflineAdapter,
    create: async () => ({
      redirectUrl: 'https://other.example.invalid' + callbackPath,
    }),
  };
  const offOrigin = await POST(checkoutRequest());
  assert.equal(offOrigin.status, 500);
  assert.equal(checkoutWrites, 1);
  console.log(
    '✓ Offline initiation and owned redirects pass while external payment paths stay closed'
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
