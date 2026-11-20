import assert from 'node:assert/strict';
import * as fulfillment from '../lib/fulfillment';
import * as orderClaim from '../lib/offline-payment-order';
import * as orderStatus from '../lib/orderStatus';
import * as orderStock from '../lib/orderStock';
import * as validation from '../lib/validation';
import { loadRoute } from './helpers/load-route';

const orderId = 'syntheticorder';
const paymentId = 'syntheticpayment';
const amount = 50_000;
const role = 'ADMIN';
const items = [{ productId: 'syntheticproduct', quantity: 1 }];
type Response = { status: number; data: unknown };
type Handler = (request: unknown, context?: unknown) => Promise<Response>;

function setup(
  options: {
    paymentStatus?: string;
    paymentGateway?: string;
    amount?: number;
    total?: number;
    orderStatus?: string;
    observedOrderStatus?: string;
    observedPaymentStatus?: string;
    previousPayment?: boolean;
    role?: string;
    createdAt?: Date;
    conflict?: boolean;
  } = {}
) {
  const events: string[] = [];
  const order = {
    id: orderId,
    status: options.orderStatus ?? 'PENDING',
    totalToman: options.total ?? amount,
  };
  const payment = {
    id: paymentId,
    orderId,
    gateway: options.paymentGateway ?? 'OFFLINE',
    status: options.paymentStatus ?? 'PENDING',
    amountToman: options.amount ?? amount,
    createdAt: options.createdAt ?? new Date(),
    order: { user: { email: 'buyer@example.invalid' }, items },
  };
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, value: string) => {
      if (parts.join('?').includes('FROM "Order"')) {
        assert.equal(value, orderId);
        return [order];
      }
      assert.match(parts.join('?'), /FROM "Payment" WHERE id = \? FOR UPDATE/);
      assert.equal(value, paymentId);
      events.push('lock');
    },
    payment: {
      findUnique: async () => payment,
      update: async ({ data }: { data: { status: string } }) => {
        events.push('payment');
        payment.status = data.status;
      },
    },
    orderShipping: { findUnique: async () => null },
    order: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        assert.equal(where.id, orderId);
        assert.equal(where.status, options.observedOrderStatus ?? order.status);
        if (where.status !== order.status) throw { code: 'P2025' };
        events.push('transition');
        order.status = data.status;
        return order;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string; totalToman: number };
        data: { status: string };
      }) => {
        events.push('claim');
        assert.equal(where.id, orderId);
        assert.equal(where.status, 'PENDING');
        assert.equal(where.totalToman, payment.amountToman);
        if (
          where.status !== order.status ||
          where.totalToman !== order.totalToman
        )
          return { count: 0 };
        order.status = data.status;
        return { count: 1 };
      },
    },
    orderItem: { findMany: async () => items },
    product: {
      updateMany: async () => {
        events.push('stock');
        return { count: 1 };
      },
    },
  };
  const admin = {
    id: 'syntheticadmin',
    role: options.role ?? role,
    email: 'admin@example.invalid',
  };
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (data: unknown, init?: { status?: number }) => ({
          data,
          status: init?.status ?? 200,
        }),
      },
    },
    '@/lib/auth': { auth: async () => ({ user: admin }) },
    '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
    '@/lib/rateLimit': {
      adminRateLimit: {},
      withRateLimit: (_: unknown, handler: Handler) => handler,
    },
    '@/lib/notifications': {
      sendNotification: () => assert.fail('Provider may not run in this test'),
      sendFulfillmentNotification: () =>
        assert.fail('Provider may not run in this test'),
    },
    '@sentry/nextjs': { captureException: () => {}, setUser: () => {} },
    '@/lib/offline-payment-order': orderClaim,
    '@/lib/fulfillment': fulfillment,
    '@/lib/orderStatus': orderStatus,
    '@/lib/orderStock': orderStock,
    '@/lib/validation': validation,
    '@/lib/prisma': {
      prisma: {
        user: { findUnique: async () => admin },
        payment: {
          findUnique: async () =>
            options.previousPayment === false
              ? null
              : {
                  ...payment,
                  status: options.observedPaymentStatus ?? payment.status,
                },
        },
        order: {
          findUnique: async () => ({
            ...order,
            status: options.observedOrderStatus ?? order.status,
          }),
        },
        $transaction: async (
          callback: (client: typeof tx) => Promise<unknown>
        ) => {
          if (options.conflict) throw { code: 'P2034' };
          return callback(tx);
        },
      },
    },
  };
  const context = { params: Promise.resolve({ id: orderId }) };
  const loaderOptions = {
    setImmediate: () => {
      events.push('notification');
    },
  };
  const { POST } = loadRoute<{ POST: Handler }>(
    'app/api/admin/payments/mark-paid/route.ts',
    dependencies,
    loaderOptions
  );
  const { PATCH: paymentPatch } = loadRoute<{ PATCH: Handler }>(
    'app/api/admin/payments/route.ts',
    dependencies,
    loaderOptions
  );
  const { PATCH: orderPatch } = loadRoute<{ PATCH: Handler }>(
    'app/api/admin/orders/[id]/status/route.ts',
    dependencies,
    loaderOptions
  );
  return {
    events,
    order,
    payment,
    mark: () => POST({ json: async () => ({ orderId }) }),
    markWithReason: (reason = 'Synthetic proof of payment') =>
      paymentPatch({
        json: async () => ({ paymentId, action: 'mark_paid', reason }),
      }),
    cancel: () =>
      orderPatch({ json: async () => ({ action: 'cancel' }) }, context),
  };
}

async function run() {
  for (const confirm of ['mark', 'markWithReason'] as const) {
    for (const options of [
      { total: amount + 1 },
      { orderStatus: 'CANCELED' },
      { orderStatus: 'DELIVERED' },
    ]) {
      const fixture = setup(options);
      assert.equal((await fixture[confirm]()).status, 409);
      assert.deepEqual(fixture.events, ['lock', 'claim']);
      assert.equal(fixture.payment.status, 'PENDING');
      assert.equal(fixture.order.status, options.orderStatus ?? 'PENDING');
    }
    const zero = setup({ total: 0, amount: 0 });
    assert.equal((await zero[confirm]()).status, 409);
    assert.deepEqual(zero.events, ['lock']);
    const denied = setup({ role: 'SELLER' });
    assert.equal((await denied[confirm]()).status, 403);
    assert.deepEqual(denied.events, []);
    const conflict = setup({ conflict: true });
    assert.equal((await conflict[confirm]()).status, 409);
    assert.deepEqual(conflict.events, []);
  }

  const first = setup();
  assert.equal((await first.mark()).status, 200);
  assert.equal(first.order.status, 'PAID');
  assert.equal(first.payment.status, 'PAID');
  assert.deepEqual(first.events, [
    'lock',
    'claim',
    'payment',
    'stock',
    'notification',
  ]);
  assert.equal(
    JSON.stringify((await first.mark()).data),
    JSON.stringify({ ok: true, already: true })
  );
  assert.deepEqual(first.events, [
    'lock',
    'claim',
    'payment',
    'stock',
    'notification',
  ]);

  const replay = setup({
    observedPaymentStatus: 'PENDING',
    paymentStatus: 'PAID',
  });
  assert.equal(
    JSON.stringify((await replay.mark()).data),
    JSON.stringify({ ok: true, already: true })
  );
  assert.deepEqual(replay.events, ['lock']);

  const withReason = setup();
  assert.equal((await withReason.markWithReason('short')).status, 400);
  assert.deepEqual(withReason.events, []);
  const response = await withReason.markWithReason();
  assert.equal(response.status, 200);
  assert.equal(
    JSON.stringify(response.data),
    JSON.stringify({
      success: true,
      message: 'Payment marked as paid successfully',
      data: { paymentId, orderId },
    })
  );
  assert.deepEqual(withReason.events, ['lock', 'claim', 'payment', 'stock']);
  assert.equal((await withReason.markWithReason()).status, 409);
  assert.deepEqual(withReason.events, [
    'lock',
    'claim',
    'payment',
    'stock',
    'lock',
  ]);

  for (const options of [
    { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    { amount: 50_000_001, total: 50_000_001 },
    { paymentGateway: 'ZARINPAL' },
  ]) {
    const fixture = setup(options);
    assert.equal((await fixture.markWithReason()).status, 400);
    assert.deepEqual(fixture.events, ['lock']);
  }

  const staleCancel = setup({
    observedOrderStatus: 'PENDING',
    orderStatus: 'PAID',
  });
  assert.equal((await staleCancel.cancel()).status, 409);
  assert.equal(staleCancel.order.status, 'PAID');
  assert.deepEqual(staleCancel.events, []);
  const validCancel = setup();
  assert.equal((await validCancel.cancel()).status, 200);
  assert.equal(validCancel.order.status, 'CANCELED');
  assert.deepEqual(validCancel.events, ['transition']);
  console.log(
    '✓ Manual payment capture and admin order transition guards passed'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
