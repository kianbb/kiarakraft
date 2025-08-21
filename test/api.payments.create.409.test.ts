import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, __setTestOverrides } from '../app/api/payments/create/route';

// Minimal fake types
type User = { id: string; email: string };

function makeJsonRequest(
  url: string,
  body: any,
  headers?: Record<string, string>
) {
  return new NextRequest(url, {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      // Satisfy CSRF checks
      origin: 'http://localhost:3000',
      referer: 'http://localhost:3000/checkout',
      host: 'localhost:3000',
      ...(headers || {}),
    }),
    body: JSON.stringify(body),
  }) as any;
}

async function run() {
  // Arrange: fake session, prisma, adapter
  const fakeUser: User = { id: 'u1', email: 'buyer@example.com' };

  const fakeSession = { user: { email: fakeUser.email } } as any;
  const getServerSession = async () => fakeSession;

  const prisma = {
    user: {
      findUnique: async ({ where: { email } }: any) =>
        email === fakeUser.email ? fakeUser : null,
    },
    order: {
      findFirst: async () => ({
        id: 'o1',
        userId: fakeUser.id,
        status: 'PENDING',
        totalToman: 1000,
      }),
      findUnique: async ({ where: { id } }: any) => ({ id, status: 'PENDING' }),
    },
    orderItem: {
      findMany: async () => [
        {
          productId: 'p1',
          quantity: 2,
          product: { title: 'X', stock: 1, active: true },
        }, // insufficient
      ],
    },
    $transaction: async (fn: any) => {
      const tx = {
        order: { update: async () => ({}) },
        cart: { upsert: async () => ({ id: 'c1' }) },
        cartItem: { upsert: async () => ({}) },
      };
      return fn(tx);
    },
    payment: {
      findUnique: async () => null,
      create: async () => ({}),
    },
  } as any;

  const adapter = {
    gateway: 'OFFLINE',
    create: async () => ({
      authority: 'a1',
      redirectUrl: 'http://pay.local/ok',
    }),
  } as any;

  __setTestOverrides({ getServerSession, prisma, adapter });

  // Act: call route
  const req = makeJsonRequest('http://localhost:3000/api/payments/create', {
    orderId: 'o1',
  });
  const res = await POST(req);
  const status = (res as any).status || res.status;
  const json = (await (res as any).json?.()) ?? JSON.parse(await res.text());

  // Assert 409 flags & structure
  assert.equal(status, 409, 'should return 409 on insufficient stock');
  assert.equal(json.error, 'insufficient_stock');
  assert.equal(json.orderCanceled, true);
  assert.equal(json.cartRestored, true);
  assert.ok(
    Array.isArray(json.details) && json.details.length > 0,
    'details should list issues'
  );

  console.log('✓ API payments/create 409 test passed');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
