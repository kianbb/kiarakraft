import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadRoute } from './helpers/load-route';
import { publicProductSelect } from '../lib/public-product';

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

async function run() {
  const auth = async () => ({
    user: { id: 'buyer', email: 'buyer@example.invalid' },
  });
  const orderRoute = loadRoute<{ GET: Handler }>(
    'app/api/orders/[id]/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': { auth },
      '@/lib/public-product': { publicProductSelect },
      '@/lib/prisma': {
        prisma: {
          user: { findUnique: async () => ({ id: 'buyer' }) },
          order: {
            findFirst: async (query: {
              where: { id: string; userId: string };
              include: { items: { include: { product: { select: unknown } } } };
            }) => {
              assert.equal(query.where.userId, 'buyer');
              assert.equal(
                query.include.items.include.product.select,
                publicProductSelect
              );
              assert.equal(
                'nationalIdHash' in publicProductSelect.seller.select,
                false
              );
              assert.ok(
                query.where.id,
                'A promised route ID must not be silently omitted'
              );
              return query.where.id === 'owned-order'
                ? { id: 'owned-order' }
                : null;
            },
          },
        },
      },
    }
  );
  for (const [id, status] of [
    ['owned-order', 200],
    ['other-order', 404],
  ] as const) {
    const response = await orderRoute.GET(
      new NextRequest('http://127.0.0.1/api/orders/' + id),
      { params: Promise.resolve({ id }) }
    );
    assert.equal(response.status, status);
  }

  let mutations = 0;
  const addressRoute = loadRoute<{ PUT: Handler; DELETE: Handler }>(
    'app/api/addresses/[id]/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': { auth },
      '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
      zod: { z },
      '@/lib/db': {
        prisma: {
          address: {
            findFirst: async ({
              where,
            }: {
              where: { id: string; userId: string };
            }) => {
              assert.equal(where.userId, 'buyer');
              assert.ok(
                where.id,
                'Ownership checks must retain the promised route ID'
              );
              return where.id === 'owned-address' ? { id: where.id } : null;
            },
            update: async ({ where }: { where: { id: string } }) => {
              assert.equal(where.id, 'owned-address');
              mutations++;
              return { id: where.id };
            },
            delete: async ({ where }: { where: { id: string } }) => {
              assert.equal(where.id, 'owned-address');
              mutations++;
            },
          },
          order: {
            count: async ({ where }: { where: { addressId: string } }) => {
              assert.equal(where.addressId, 'owned-address');
              return 0;
            },
          },
        },
      },
    }
  );
  for (const method of ['PUT', 'DELETE'] as const) {
    for (const [id, status] of [
      ['other-address', 404],
      ['owned-address', 200],
    ] as const) {
      const response = await addressRoute[method](
        new NextRequest(`http://127.0.0.1/api/addresses/${id}`, {
          method,
          ...(method === 'PUT'
            ? {
                body: JSON.stringify({
                  fullName: 'Synthetic',
                  phone: '000',
                  country: 'IR',
                  province: 'Synthetic',
                  city: 'Synthetic',
                  line1: 'Synthetic',
                }),
              }
            : {}),
        }),
        { params: Promise.resolve({ id }) }
      );
      assert.equal(response.status, status);
    }
  }
  assert.equal(mutations, 2, 'Other-account addresses must never be mutated');
  console.log(
    '✓ Promised order/address parameters retain ownership and safe projection'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
