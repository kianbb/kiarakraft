import assert from 'node:assert/strict';
import * as orderStatus from '../lib/orderStatus';
import { loadRoute } from './helpers/load-route';

type Response = { status: number; data: unknown };
type Handler = (request: unknown, context?: unknown) => Promise<Response>;
type ListQuery = {
  where: { items: { some: { product: { sellerId: string } } } };
  include: {
    user: { select: Record<string, boolean> };
    items: { where: { product: { sellerId: string } } };
  };
};

function setup(
  options: {
    sellerIds?: string[];
    hasProfile?: boolean;
    role?: string;
    statusChanged?: boolean;
  } = {}
) {
  const profileId = 'synthetic-profile';
  const buyer = {
    id: 'synthetic-buyer',
    name: 'Synthetic buyer',
    email: 'buyer@example.invalid',
    password: 'synthetic-private-hash',
    passwordChangedAt: 'private-marker',
    role: 'BUYER',
  };
  let listQuery: ListQuery | undefined;
  let writes = 0;
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (data: unknown, options?: { status?: number }) => ({
          status: options?.status ?? 200,
          data,
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
            const selection = query.include.user.select;
            return [
              {
                id: 'synthetic-order',
                user: Object.fromEntries(
                  Object.keys(selection).map(key => [
                    key,
                    buyer[key as keyof typeof buyer],
                  ])
                ),
              },
            ];
          },
          findUnique: async () => ({
            id: 'synthetic-order',
            status: 'PAID',
            items: (options.sellerIds ?? [profileId]).map(sellerId => ({
              product: { sellerId },
            })),
          }),
          update: async ({
            where,
            data,
          }: {
            where: { status: string };
            data: unknown;
          }) => {
            assert.equal(
              where.status,
              'PAID',
              'Fulfillment must compare the previously authorized state'
            );
            if (options.statusChanged) throw { code: 'P2025' };
            writes++;
            return { id: 'synthetic-order', ...(data as object) };
          },
        },
      },
    },
    '@/lib/rateLimit': {
      sellerRateLimit: {},
      withRateLimit: (_config: unknown, handler: Handler) => handler,
    },
    '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
    '@/lib/orderStatus': orderStatus,
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
    owner.query().include.items.where.product.sellerId,
    'synthetic-profile'
  );
  assert.deepEqual(Object.keys(owner.query().include.user.select).sort(), [
    'email',
    'id',
    'name',
  ]);
  const serialized = JSON.stringify(list.data);
  assert.ok(!serialized.includes('synthetic-private-hash'));
  assert.ok(!serialized.includes('passwordChangedAt'));
  assert.equal(
    (await owner.update()).status,
    200,
    'Profile owner must be able to fulfill own order'
  );
  assert.equal(owner.writes(), 1);

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
  console.log('✓ seller order ownership/projection handler regressions passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
