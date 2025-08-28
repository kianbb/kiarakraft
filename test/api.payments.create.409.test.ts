import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { POST, __setTestOverrides } from '../app/api/payments/create/route';
import { Session } from 'next-auth';

// Test types
type User = { id: string; email: string };
type WhereClause = { where: { email?: string; id?: string } };
type TransactionFn = (tx: {
  order: { update: () => Promise<Record<string, unknown>> };
  cart: { upsert: () => Promise<{ id: string }> };
  cartItem: { upsert: () => Promise<Record<string, unknown>> };
}) => Promise<unknown>;

function makeJsonRequest(
  url: string,
  body: Record<string, unknown>,
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
  });
}

async function run() {
  // Arrange: fake session, prisma, adapter
  const fakeUser: User = { id: 'u1', email: 'buyer@example.com' };

  const fakeSession: Session = {
    user: {
      email: fakeUser.email,
      id: fakeUser.id,
      name: null,
      image: null,
      role: 'BUYER',
      sellerProfile: null,
    },
    expires: '2025-12-31T23:59:59.999Z',
  };
  const getSession = async (): Promise<Session> => fakeSession;

  const prisma = {
    user: {
      findUnique: async ({ where: { email } }: WhereClause) =>
        email === fakeUser.email ? fakeUser : null,
    },
    order: {
      findFirst: async () => ({
        id: 'o1',
        userId: fakeUser.id,
        status: 'PENDING',
        totalToman: 1000,
      }),
      findUnique: async ({ where: { id } }: WhereClause) => ({
        id,
        status: 'PENDING',
      }),
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
    $transaction: async (fn: TransactionFn) => {
      const tx = {
        order: { update: async () => ({}) },
        cart: { upsert: async () => ({ id: 'c1' }) },
        cartItem: { upsert: async () => ({}) },
      };
      return await fn(tx);
    },
    payment: {
      findUnique: async () => null,
      create: async () => ({}),
    },
  };

  const adapter = {
    gateway: 'OFFLINE',
    create: async () => ({
      authority: 'a1',
      redirectUrl: 'http://pay.local/ok',
    }),
  };

  // Type assertion for test mocks
  __setTestOverrides({
    getSession: getSession as never,
    prisma: prisma as never,
    adapter: adapter as never,
  });

  // Act: call route
  const req = makeJsonRequest('http://localhost:3000/api/payments/create', {
    orderId: 'o1',
  });
  const res = await POST(req);
  const response = res as NextResponse;
  const status = response.status;
  const json = await response.json();

  // Assert 409 flags & structure
  assert.equal(status, 409, 'should return 409 on insufficient stock');
  assert.equal(json.error, 'insufficient_stock');
  assert.equal(json.orderCanceled, true);
  assert.equal(json.cartRestored, true);
  assert.ok(
    Array.isArray(json.details) && json.details.length > 0,
    'should have details array with items'
  );

  console.log('✅ Test passed: API returns 409 for insufficient stock');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
