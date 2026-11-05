import assert from 'node:assert/strict';
import { z } from 'zod';
import * as shipping from '../lib/shipping';
import * as publicProduct from '../lib/public-product';
import { loadRoute } from './helpers/load-route';

// Execute the actual order handler with synthetic persistence/auth adapters.
// No Prisma, provider credentials, application server, or database is loaded.
async function placeOrder(
  body: Record<string, unknown>,
  productOverrides: Partial<{
    active: boolean;
    isTest: boolean;
    eligibilityStatus: string;
  }> = {}
) {
  const createdOrders: Record<string, unknown>[] = [];
  const createdShipping: Record<string, unknown>[] = [];
  let transactions = 0;
  const product = {
    id: 'synthetic-product',
    title: 'Synthetic craft',
    priceToman: 250000,
    active: true,
    isTest: false,
    eligibilityStatus: 'APPROVED',
    stock: 5,
    ...productOverrides,
  };
  const tx = {
    $queryRaw: async () => [product],
    order: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdOrders.push(data);
        return { id: 'synthetic-order', ...data };
      },
    },
    orderShipping: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdShipping.push(data);
      },
    },
    orderItem: { create: async () => ({}) },
    cartItem: { deleteMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    user: { findUnique: async () => ({ id: 'synthetic-buyer' }) },
    address: { findFirst: async () => ({ id: 'synthetic-address' }) },
    cart: {
      findUnique: async () => ({
        id: 'synthetic-cart',
        items: [{ productId: product.id, quantity: 2, product }],
      }),
    },
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => {
      transactions++;
      return callback(tx);
    },
  };
  type Handler = (request: unknown) => Promise<{ status: number }>;
  const dependencies: Record<string, unknown> = {
    'next/server': {
      NextResponse: {
        json: (data: unknown, options?: { status?: number }) => ({
          status: options?.status ?? 200,
          data,
        }),
      },
    },
    '@/lib/auth': {
      auth: async () => ({ user: { email: 'buyer@example.invalid' } }),
    },
    '@/lib/prisma': { prisma },
    '@/lib/rateLimit': {
      orderRateLimit: {},
      withRateLimit: (_config: unknown, handler: Handler) => handler,
    },
    '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
    '@/lib/shipping': shipping,
    '@/lib/public-product': publicProduct,
    zod: { z },
  };
  const routeExports = loadRoute<{ POST: Handler }>(
    'app/api/orders/route.ts',
    dependencies
  );
  const response = await routeExports.POST({ json: async () => body });
  return { response, createdOrders, createdShipping, transactions };
}

async function run() {
  // Old and tampered clients cannot select a charge. Assert persisted amounts,
  // including the order total, rather than just checking the price lookup.
  for (const [method, expectedPrice] of [
    ['STANDARD', 50000],
    ['EXPRESS', 120000],
    ['PICKUP', 0],
  ] as const) {
    for (const suppliedPrice of [0, -1, 1, 999999, '0', undefined]) {
      const result = await placeOrder({
        addressId: 'synthetic-address',
        shippingMethod: method,
        ...(suppliedPrice === undefined
          ? {}
          : { shippingPrice: suppliedPrice }),
      });
      assert.equal(result.response.status, 200, `${method} should be accepted`);
      assert.equal(result.createdShipping[0].method, method);
      assert.equal(result.createdShipping[0].priceToman, expectedPrice);
      assert.equal(result.createdOrders[0].totalToman, 500000 + expectedPrice);
    }
  }
  for (const method of ['OVERNIGHT', 'express', '__proto__', '', null]) {
    const result = await placeOrder({
      addressId: 'synthetic-address',
      shippingMethod: method,
      shippingPrice: 0,
    });
    assert.equal(result.response.status, 400);
    assert.equal(
      result.transactions,
      0,
      'Invalid method must not write orders'
    );
    assert.equal(result.createdShipping.length, 0);
  }
  for (const overrides of [
    { active: false },
    { isTest: true },
    { eligibilityStatus: 'PENDING' },
    { eligibilityStatus: 'REJECTED' },
  ]) {
    const result = await placeOrder(
      {
        addressId: 'synthetic-address',
        shippingMethod: 'STANDARD',
      },
      overrides
    );
    assert.equal(
      result.response.status,
      409,
      'Revoked/test products cannot be ordered'
    );
    assert.equal(result.createdOrders.length, 0);
    assert.equal(result.createdShipping.length, 0);
  }
  console.log(
    '✓ checkout shipping/orderability handler regressions passed (27 requests)'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
