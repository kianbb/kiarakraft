import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadRoute } from './helpers/load-route';
import { publicProductSelect } from '../lib/public-product';
import * as orderRead from '../lib/order-read';

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

async function run() {
  const buyer = { id: 'buyer', email: 'buyer@example.invalid', role: 'BUYER' };
  let signedIn = true;
  const auth = async () => (signedIn ? { user: buyer } : null);
  const createdAt = new Date('2026-05-01T12:00:00Z');
  const updatedAt = new Date('2026-05-02T12:00:00Z');
  const operator = 'private-operator@example.invalid';
  const shipping = {
    id: 'private-shipment-id',
    orderId: 'owned-order',
    method: 'STANDARD',
    status: 'SHIPPED',
    priceToman: 10_000,
    trackingNo: 'TRACK-123',
    createdAt,
    updatedAt,
    history: {
      notes: 'private-outer-note',
      events: [
        null,
        {
          status: 'PROCESSING',
          timestamp: createdAt.toISOString(),
          updatedBy: operator,
        },
        { status: 'DELIVERED', timestamp: 'private-unparseable-time' },
        { status: operator, timestamp: updatedAt.toISOString() },
        {
          status: 'SHIPPED',
          timestamp: '2026-05-02T16:00:00+04:00',
          trackingNo: 'TRACK-123',
          updatedBy: operator,
          notes: 'private-warehouse-note',
          arbitrary: { email: operator },
        },
        {
          kind: 'metadata',
          status: 'SHIPPED',
          timestamp: '2026-05-03T12:00:00.000Z',
          trackingNo: 'TRACK-METADATA-ONLY',
          notes: 'private-later-tracking-edit',
        },
      ],
    },
  };
  const expectedShipping = {
    method: 'STANDARD',
    status: 'SHIPPED',
    priceToman: 10_000,
    trackingNo: 'TRACK-123',
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    history: {
      events: [
        { status: 'PROCESSING', timestamp: createdAt.toISOString() },
        {
          status: 'SHIPPED',
          timestamp: updatedAt.toISOString(),
          trackingNo: 'TRACK-123',
        },
      ],
    },
  } satisfies orderRead.BuyerShipping;
  const address = {
    id: 'owned-address',
    userId: buyer.id,
    fullName: 'Synthetic recipient',
    phone: '000',
    line1: 'Synthetic delivery address',
    line2: null,
    city: 'Synthetic city',
    province: 'Synthetic province',
    postal: '00000',
    country: 'IR',
  };
  const item = {
    id: 'owned-item',
    quantity: 2,
    unitPriceToman: 250_000,
    product: {
      id: 'synthetic-product',
      title: 'Ceramic bowl',
      slug: 'ceramic-bowl',
    },
  };
  const receipt = {
    id: 'owned-order',
    status: 'SHIPPED',
    totalToman: 510_000,
    items: [item],
    shipping,
  };
  const laterOrderTime = '2026-05-04T12:00:00.000Z';
  assert.deepEqual(
    orderRead.buyerShippingTimeline(expectedShipping, {
      status: 'SHIPPED',
      updatedAt: laterOrderTime,
    }),
    expectedShipping.history.events,
    'An existing fact takes precedence over mutable delivery metadata'
  );
  const legacyShipment = {
    ...expectedShipping,
    status: 'DELIVERED',
    history: null,
    updatedAt: '2026-05-05T12:00:00.000Z',
  };
  const prepared = {
    status: 'PROCESSING',
    timestamp: expectedShipping.createdAt,
  };
  assert.deepEqual(
    orderRead.buyerShippingTimeline(legacyShipment, {
      status: 'DELIVERED',
      updatedAt: laterOrderTime,
    }),
    [
      prepared,
      {
        status: 'DELIVERED',
        timestamp: laterOrderTime,
        trackingNo: 'TRACK-123',
      },
    ]
  );
  assert.deepEqual(
    orderRead.buyerShippingTimeline(legacyShipment, {
      status: 'PAID',
      updatedAt: laterOrderTime,
    }),
    [prepared],
    'Disagreeing legacy rows cannot establish a dated phase'
  );
  assert.deepEqual(
    orderRead.buyerShippingTimeline(
      { ...legacyShipment, createdAt: legacyShipment.updatedAt },
      { status: 'DELIVERED', updatedAt: laterOrderTime }
    ),
    [
      {
        status: 'DELIVERED',
        timestamp: laterOrderTime,
        trackingNo: 'TRACK-123',
      },
    ],
    'A catch-up shipment must not appear to prepare an already delivered order'
  );
  let lookupCount = 0;
  const orderRoute = loadRoute<{ GET: Handler }>(
    'app/api/orders/[id]/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': { auth },
      '@/lib/public-product': { publicProductSelect },
      '@/lib/order-read': orderRead,
      '@/lib/prisma': {
        prisma: {
          user: { findUnique: async () => ({ id: 'buyer' }) },
          order: {
            findFirst: async (query: {
              where: { id: string; userId: string };
              select: {
                shipping: { select: unknown };
                items: { include: { product: { select: unknown } } };
              };
            }) => {
              lookupCount++;
              assert.equal(query.where.userId, 'buyer');
              assert.equal(
                query.select.shipping.select,
                orderRead.buyerShippingSelect
              );
              assert.equal(
                query.select.items.include.product.select,
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
              if (query.where.id === 'owned-order')
                return { ...receipt, address };
              if (query.where.id === 'legacy-order') {
                return {
                  ...receipt,
                  id: 'legacy-order',
                  address,
                  shipping: { ...shipping, history: { events: [null, []] } },
                };
              }
              if (query.where.id === 'unshipped-order') {
                return {
                  ...receipt,
                  id: 'unshipped-order',
                  address,
                  shipping: null,
                };
              }
              return null;
            },
          },
        },
      },
    }
  );
  for (const [id, status] of [
    ['owned-order', 200],
    ['legacy-order', 200],
    ['unshipped-order', 200],
    ['other-order', 404],
  ] as const) {
    const response = await orderRoute.GET(
      new NextRequest('http://127.0.0.1/api/orders/' + id),
      { params: Promise.resolve({ id }) }
    );
    assert.equal(response.status, status);
    if (status !== 200) continue;
    assert.match(
      response.headers.get('cache-control') || '',
      /private, no-store/
    );
    const payload = await response.json();
    assert.deepEqual(payload.address, address);
    assert.deepEqual(payload.items, [item]);
    assert.equal(payload.totalToman, receipt.totalToman);
    if (id === 'owned-order')
      assert.deepEqual(payload.shipping, expectedShipping);
    if (id === 'legacy-order')
      assert.deepEqual(payload.shipping, {
        ...expectedShipping,
        history: null,
      });
    if (id === 'unshipped-order') assert.equal(payload.shipping, null);
  }
  signedIn = false;
  assert.equal(
    (
      await orderRoute.GET(
        new NextRequest('http://127.0.0.1/api/orders/owned-order'),
        { params: Promise.resolve({ id: 'owned-order' }) }
      )
    ).status,
    401
  );
  assert.equal(lookupCount, 4);
  signedIn = true;

  const review = { id: 'own-review', body: 'Buyer-authored review' };
  const wishlistItem = { id: 'own-wishlist', product: item.product };
  const returnRequest = {
    id: 'own-return',
    reason: 'Buyer-authored return reason',
  };
  const ownRows =
    <T>(rows: T[]) =>
    async ({ where }: { where: { userId: string } }) => {
      assert.equal(where.userId, buyer.id);
      return rows;
    };
  const exportRoute = loadRoute<{ GET: () => Promise<Response> }>(
    'app/api/account/data/export/route.ts',
    {
      'next/server': { NextResponse },
      '@/lib/auth': { auth },
      '@/lib/order-read': orderRead,
      '@/lib/db': {
        db: {
          user: {
            findUnique: async ({ where }: { where: { id: string } }) => {
              assert.equal(where.id, buyer.id);
              return buyer;
            },
          },
          address: { findMany: ownRows([address]) },
          order: {
            findMany: async (
              query: Parameters<ReturnType<typeof ownRows>>[0] & {
                select: { shipping: { select: unknown } };
              }
            ) => {
              assert.equal(
                query.select.shipping.select,
                orderRead.buyerShippingSelect
              );
              return ownRows([receipt])(query);
            },
          },
          review: { findMany: ownRows([review]) },
          wishlistItem: { findMany: ownRows([wishlistItem]) },
          returnRequest: { findMany: ownRows([returnRequest]) },
        },
      },
    }
  );
  const response = await exportRoute.GET();
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-disposition') || '',
    /^attachment; filename="kiarakraft-data-export-\d+\.json"$/
  );
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const download = await response.json();
  assert.deepEqual(download.personalInfo, buyer);
  assert.deepEqual(download.addresses, [address]);
  assert.deepEqual(download.orderHistory, {
    orders: [{ ...receipt, shipping: expectedShipping }],
    totalOrders: 1,
    totalSpent: receipt.totalToman,
  });
  assert.deepEqual(download.reviews.reviews, [review]);
  assert.deepEqual(download.wishlist.items, [wishlistItem]);
  assert.deepEqual(download.returns.requests, [returnRequest]);
  signedIn = false;
  assert.equal((await exportRoute.GET()).status, 401);
  signedIn = true;

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
