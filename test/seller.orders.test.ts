import assert from 'node:assert/strict';
import * as orderRead from '../lib/order-read';
import * as orderStatus from '../lib/orderStatus';
import * as fulfillment from '../lib/fulfillment';
import { loadRoute } from './helpers/load-route';

type Response = {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
};
type Handler = (request: unknown, context?: unknown) => Promise<Response>;
type ListQuery = {
  where: { items: { some: { product: { sellerId: string } } } };
  select: typeof orderRead.sellerOrderSelect & {
    items: { where: { product: { sellerId: string } } };
  };
};

const firstProfile = 'synthetic-profile';
const otherProfile = 'other-profile';
const address = {
  fullName: 'Synthetic delivery recipient',
  phone: '000',
  line1: 'Synthetic address',
  line2: null,
  city: 'Synthetic city',
  province: 'Synthetic province',
  postal: '00000',
};
const makeItem = (sellerId: string, title: string, unitPriceToman: number) => ({
  id: `item-${sellerId}`,
  quantity: 2,
  unitPriceToman,
  product: {
    sellerId,
    title,
    description: 'private-unneeded-product-description',
    images: [
      { url: '/synthetic.jpg', alt: title, publicId: 'private-asset-id' },
    ],
  },
});
const firstItem = makeItem(firstProfile, 'Synthetic bowl', 250_000);
const otherItem = makeItem(
  otherProfile,
  'Other seller synthetic scarf',
  700_000
);
const sampleOrder = {
  id: 'synthetic-order',
  status: 'PAID',
  createdAt: '2026-05-01T12:00:00.000Z',
  totalToman: 1_950_000,
  userId: 'private-buyer-account-id',
  user: {
    email: 'private-buyer@example.invalid',
    name: 'Private account name',
  },
  address: {
    ...address,
    userId: 'private-buyer-account-id',
    country: 'IR',
    isDefault: true,
  },
  shipping: {
    history: {
      events: [
        {
          updatedBy: 'private-operator@example.invalid',
          notes: 'private-operator-note',
        },
      ],
    },
  },
  items: [firstItem, otherItem],
};

function pickSelected(
  row: Record<string, unknown>,
  select: Record<string, unknown>
) {
  return Object.fromEntries(
    Object.keys(select)
      .filter(key => select[key] === true)
      .map(key => [key, row[key]])
  );
}

function setup(
  options: {
    sellerIds?: string[];
    hasProfile?: boolean;
    role?: string;
    statusChanged?: boolean;
    profileId?: string;
  } = {}
) {
  const profileId = options.profileId ?? firstProfile;
  let listQuery: ListQuery | undefined;
  let writes = 0;
  let notifications = 0;
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (
          data: unknown,
          options?: { status?: number; headers?: Record<string, string> }
        ) => ({
          status: options?.status ?? 200,
          data,
          headers: options?.headers,
        }),
      },
    },
    '@/lib/auth': {
      auth: async () => ({
        user: {
          email: 'seller@example.invalid',
          role: options.role ?? 'SELLER',
        },
      }),
    },
    '@/lib/prisma': {
      prisma: {
        user: {
          findUnique: async () => ({
            id: 'synthetic-user',
            sellerProfile:
              options.hasProfile === false ? null : { id: profileId },
          }),
        },
        order: {
          findMany: async (query: ListQuery) => {
            listQuery = query;
            const select = query.select;
            const itemSelect = select.items.select;
            const productSelect = itemSelect.product.select;
            const orders = [
              sampleOrder,
              { ...sampleOrder, id: 'other-order', items: [otherItem] },
            ];
            return orders
              .filter(order =>
                order.items.some(
                  item =>
                    item.product.sellerId ===
                    query.where.items.some.product.sellerId
                )
              )
              .map(order => ({
                ...pickSelected(order, select),
                address: pickSelected(order.address, select.address.select),
                items: order.items
                  .filter(
                    item =>
                      item.product.sellerId ===
                      select.items.where.product.sellerId
                  )
                  .map(item => ({
                    ...pickSelected(item, itemSelect),
                    product: {
                      ...pickSelected(item.product, productSelect),
                      images: item.product.images.map(image =>
                        pickSelected(image, productSelect.images.select)
                      ),
                    },
                  })),
              }));
          },
          findUnique: async () => ({
            id: 'synthetic-order',
            status: 'PAID',
            items: (options.sellerIds ?? [profileId]).map(sellerId => ({
              product: { sellerId },
            })),
          }),
        },
        $transaction: (operation: (tx: unknown) => Promise<unknown>) =>
          operation({
            $queryRaw: async () => [
              {
                id: 'synthetic-order',
                status: options.statusChanged ? 'CANCELED' : 'PAID',
              },
            ],
            orderShipping: { findUnique: async () => null },
            order: {
              update: async ({
                where,
                data,
              }: {
                where: { status: string };
                data: object;
              }) => {
                assert.equal(where.status, 'PAID');
                writes++;
                return { id: 'synthetic-order', ...data };
              },
            },
          }),
      },
    },
    '@/lib/rateLimit': {
      sellerRateLimit: {},
      withRateLimit: (_config: unknown, handler: Handler) => handler,
    },
    '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
    '@/lib/order-read': orderRead,
    '@/lib/orderStatus': orderStatus,
    '@/lib/fulfillment': fulfillment,
    '@/lib/notifications': {
      sendFulfillmentNotification: () => {
        notifications++;
      },
    },
    '@sentry/nextjs': { setUser: () => {}, captureException: () => {} },
  };
  const list = loadRoute<{ GET: Handler }>(
    'app/api/seller/orders/route.ts',
    dependencies
  );
  const status = loadRoute<{ PATCH: Handler }>(
    'app/api/seller/orders/[id]/status/route.ts',
    dependencies
  );
  return {
    list: () => list.GET({ url: 'http://127.0.0.1/api/seller/orders' }),
    update: () =>
      status.PATCH(
        { json: async () => ({ action: 'mark_shipped' }) },
        {
          params: Promise.resolve({ id: 'synthetic-order' }),
        }
      ),
    query: () => {
      assert.ok(listQuery);
      return listQuery;
    },
    writes: () => writes,
    notifications: () => notifications,
  };
}

async function run() {
  const owner = setup();
  const list = await owner.list();
  assert.equal(list.status, 200);
  assert.equal(
    owner.query().where.items.some.product.sellerId,
    'synthetic-profile'
  );
  assert.equal(
    owner.query().select.items.where.product.sellerId,
    'synthetic-profile'
  );
  assert.deepEqual(Object.keys(owner.query().select).sort(), [
    'address',
    'createdAt',
    'id',
    'items',
    'status',
  ]);
  assert.equal(list.headers?.['Cache-Control'], 'private, no-store');
  assert.deepEqual(JSON.parse(JSON.stringify(list.data)), [
    {
      id: sampleOrder.id,
      status: sampleOrder.status,
      createdAt: sampleOrder.createdAt,
      address,
      items: [
        {
          id: firstItem.id,
          quantity: firstItem.quantity,
          unitPriceToman: firstItem.unitPriceToman,
          product: {
            title: firstItem.product.title,
            images: [{ url: '/synthetic.jpg', alt: firstItem.product.title }],
          },
        },
      ],
    },
  ]);
  const secondList = await setup({ profileId: otherProfile }).list();
  assert.equal(secondList.status, 200);
  const secondOrders = JSON.parse(JSON.stringify(secondList.data));
  assert.deepEqual(
    secondOrders.map((order: { id: string }) => order.id),
    [sampleOrder.id, 'other-order']
  );
  for (const order of secondOrders) {
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].id, otherItem.id);
  }
  assert.equal(
    (await owner.update()).status,
    200,
    'Profile owner must be able to fulfill own order'
  );
  assert.equal(owner.writes(), 1);
  assert.equal(owner.notifications(), 1);

  for (const sellerIds of [
    ['other-profile'],
    ['synthetic-profile', 'other-profile'],
    ['synthetic-user'],
  ]) {
    const other = setup({ sellerIds });
    assert.equal(
      (await other.update()).status,
      403,
      'Wrong owner/mixed order must not be writable'
    );
    assert.equal(other.writes(), 0);
    assert.equal(other.notifications(), 0);
  }
  const noProfile = setup({ hasProfile: false });
  assert.equal((await noProfile.list()).status, 403);
  assert.equal((await noProfile.update()).status, 403);
  const buyer = setup({ role: 'BUYER' });
  assert.equal((await buyer.list()).status, 401);
  assert.equal((await buyer.update()).status, 401);
  const changed = setup({ statusChanged: true });
  assert.equal(
    (await changed.update()).status,
    409,
    'Concurrent cancellation must not be overwritten'
  );
  assert.equal(changed.writes(), 0);
  assert.equal(changed.notifications(), 0);
  console.log('✓ seller order ownership/projection handler regressions passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
