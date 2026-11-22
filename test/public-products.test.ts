import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/prisma';
import { GET as listProducts } from '../app/api/products/route';
import { GET as getProduct } from '../app/api/products/[id]/route';
import {
  isPublicProduct,
  publicProductSelect,
  toPublicProduct,
} from '../lib/public-product';

const privateValue = 'PRIVATE_VERIFICATION_SENTINEL';
const fixture = {
  id: 'product-one',
  sellerId: 'seller-one',
  categoryId: null,
  title: 'سفال',
  slug: 'pottery',
  description: 'دست‌ساز',
  priceToman: 1200,
  stock: 2,
  active: true,
  isTest: false,
  eligibilityStatus: 'APPROVED',
  eligibilityReasons: privateValue,
  eligibilityConfidence: 80,
  ratingAvg: 0,
  ratingCount: 0,
  tags: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  seller: {
    id: 'seller-one',
    handle: 'potter',
    shopName: 'Potter',
    displayName: 'Potter',
    verified: true,
    bio: null,
    region: null,
    avatarUrl: null,
    userId: privateValue,
    phone: privateValue,
    address: privateValue,
    nationalIdHash: privateValue,
    docsFolder: privateValue,
    verificationNotes: privateValue,
    verifiedBy: privateValue,
  },
  category: null,
  images: [
    {
      id: 'image-one',
      productId: 'product-one',
      url: '/pottery.jpg',
      alt: null,
      sortOrder: 0,
    },
  ],
  translations: [
    {
      locale: 'en',
      title: 'Pottery',
      description: 'Handmade',
      sourceHash: privateValue,
    },
  ],
};

// Model Prisma selection without ever invoking a database. Unexpected include/full-row
// queries are rejected so a regression cannot silently expose private fixture columns.
function project(row: unknown, selection: Record<string, unknown>): unknown {
  if (row === null) return null;
  if (Array.isArray(row)) return row.map(item => project(item, selection));
  return Object.fromEntries(
    Object.entries(selection).map(([key, value]) => {
      const field = (row as Record<string, unknown>)[key];
      return [
        key,
        value === true
          ? field
          : project(
              field,
              (value as { select: Record<string, unknown> }).select
            ),
      ];
    })
  );
}

async function run() {
  const dto = toPublicProduct(fixture, 'en');
  assert.equal(dto.title, 'Pottery');
  assert.equal(dto.seller.handle, 'potter');
  assert.equal(
    JSON.stringify(dto).includes(privateValue),
    false,
    'DTO must reject wider private rows'
  );
  assert.equal(
    JSON.stringify(project(fixture, publicProductSelect)).includes(
      privateValue
    ),
    false,
    'DB projection must exclude internal columns'
  );
  assert.equal(isPublicProduct(fixture), true);
  for (const state of [
    { active: false },
    { isTest: true },
    { eligibilityStatus: 'PENDING' },
    { eligibilityStatus: 'REJECTED' },
    { eligibilityStatus: 'REVIEW' },
  ])
    assert.equal(isPublicProduct({ ...fixture, ...state }), false);

  const originalMany = prisma.product.findMany;
  const originalFirst = prisma.product.findFirst;
  let calls = 0;
  const validate = (args: unknown) => {
    const query = args as {
      where: Record<string, unknown>;
      select: typeof publicProductSelect;
      include?: unknown;
    };
    assert.equal(query.include, undefined);
    assert.equal(query.where.active, true);
    assert.equal(query.where.isTest, false);
    assert.equal(query.where.eligibilityStatus, 'APPROVED');
    assert.ok(query.select, 'public route must use an explicit selection');
    return query;
  };
  try {
    prisma.product.findMany = (async args => {
      calls++;
      const query = validate(args);
      return [project(fixture, query.select)];
    }) as typeof originalMany;
    prisma.product.findFirst = (async args => {
      calls++;
      const query = validate(args);
      assert.equal(
        query.where.id,
        fixture.id,
        'await dynamic params and bind the requested product'
      );
      return project(fixture, query.select);
    }) as typeof originalFirst;
    const request = new NextRequest('http://localhost/api/products?locale=en');
    const listing = await listProducts(request);
    assert.equal(listing.status, 200);
    const listBody = await listing.json();
    assert.equal(listBody[0].title, 'Pottery');
    assert.equal(JSON.stringify(listBody).includes(privateValue), false);
    const detail = await getProduct(request, {
      params: Promise.resolve({ id: fixture.id }),
    });
    assert.equal(detail.status, 200);
    assert.equal(
      JSON.stringify(await detail.json()).includes(privateValue),
      false
    );
    const invalid = await getProduct(request, {
      params: Promise.resolve({ id: '' }),
    });
    assert.equal(invalid.status, 404);
    assert.equal(
      calls,
      2,
      'invalid ID must never become an unconstrained query'
    );
    prisma.product.findFirst = (async args => {
      validate(args);
      return null;
    }) as typeof originalFirst;
    const missing = await getProduct(request, {
      params: Promise.resolve({ id: 'hidden-product' }),
    });
    assert.equal(missing.status, 404);
  } finally {
    prisma.product.findMany = originalMany;
    prisma.product.findFirst = originalFirst;
  }
  console.log(
    'Public product projection, publication and route regression tests passed'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
