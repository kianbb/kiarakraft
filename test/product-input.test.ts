import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as productInput from '../lib/product-input';
import * as sanitization from '../lib/input-sanitization';
import { loadRoute } from './helpers/load-route';

const {
  createProductSchema,
  updateProductSchema,
  readProductInput,
  ProductInputError,
  PRODUCT_INPUT_LIMITS,
} = productInput;
const createBody = {
  name: 'Handmade bowl',
  description: 'A handmade ceramic bowl.',
  price: 120000,
  stock: 3,
  category: 'ceramics',
  tags: 'ceramic, handmade',
  images: [
    {
      url: 'https://res.cloudinary.com/synthetic/image/upload/bowl.jpg',
      alt: 'Bowl',
      sortOrder: 0,
    },
  ],
  useAI: false,
};
const updateBody = {
  title: createBody.name,
  description: createBody.description,
  priceToman: createBody.price,
  stock: createBody.stock,
  category: 'ceramics',
  imageUrl: createBody.images[0].url,
  tags: ['ceramic', 'handmade'],
  useAI: false,
};

type ResponseValue = { status: number; data: Record<string, unknown> };
type Handler = (
  request: Request,
  context?: { params: Promise<{ id: string }> }
) => Promise<ResponseValue>;

function harness(mode: 'create' | 'update') {
  const state = {
    writes: [] as Array<Record<string, unknown>>,
    imageWrites: [] as unknown[],
    productReads: 0,
    categoryReads: 0,
    jobs: 0,
    providers: 0,
  };
  const product = {
    id: 'synthetic-product',
    title: 'Handmade bowl',
    description: 'A handmade ceramic bowl.',
    priceToman: 120000,
    stock: 3,
    images: [],
  };
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'synthetic-user',
        sellerProfile: { id: 'synthetic-seller', verified: true },
      }),
    },
    category: {
      findUnique: async () => {
        state.categoryReads++;
        return { id: 'synthetic-category' };
      },
    },
    product: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.writes.push(data);
        return { ...product, ...data };
      },
      findUnique: async () => {
        state.productReads++;
        return product;
      },
      findFirst: async () => {
        state.productReads++;
        return product;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        // Keep scheduled background processing paused at its first fake write;
        // provider behavior is deliberately outside this input-boundary test.
        if (Object.keys(data).length === 1 && 'eligibilityReasons' in data)
          return new Promise(() => {});
        state.writes.push(data);
        return {
          ...product,
          ...Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined)
          ),
        };
      },
    },
    listingImage: {
      createMany: async ({ data }: { data: unknown }) => {
        state.imageWrites.push(data);
      },
    },
  };
  const provider = () => {
    state.providers++;
    assert.fail('No provider calls are allowed in input tests');
  };
  const passthrough = (handler: Handler) => handler;
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (
          data: Record<string, unknown>,
          options?: { status: number }
        ) => ({ status: options?.status ?? 200, data }),
      },
    },
    '@/lib/auth': {
      auth: async () => ({
        user: { email: 'synthetic@example.test', role: 'SELLER' },
      }),
    },
    '@/lib/prisma': { prisma },
    '@/lib/product-input': productInput,
    '@/lib/translator': { translateProductFields: provider },
    '@/lib/moderation-ai': { assessProductWithAI: provider },
    '@/lib/product-enhancement-openai': {
      enhanceProductBeforeApproval: provider,
    },
    '@/lib/product-enhancement-noai': { enhanceProductWithoutAI: provider },
    '@/lib/cloudinary': { uploadImageToCloudinary: provider },
    '@/lib/rateLimit': {
      sellerProductRateLimit: {},
      withRateLimit: (_config: unknown, handler: Handler) => handler,
    },
    '@/lib/cache': { revalidateProduct: async () => {} },
    '@/lib/input-sanitization': sanitization,
    '@sentry/nextjs': {
      captureException: () => {},
      addBreadcrumb: () => {},
      setUser: () => {},
    },
    crypto,
    '@/lib/csrf': { withCSRF: passthrough },
    '@/lib/progress-messages': {
      getBilingualProgress: () => 'Synthetic processing status',
    },
    '@vercel/functions': {
      waitUntil: (_promise: Promise<unknown>) => {
        state.jobs++;
      },
    },
  };
  const route = loadRoute<{ POST: Handler; PUT: Handler }>(
    mode === 'create'
      ? 'app/api/seller/products/route.ts'
      : 'app/api/seller/products/[id]/route.ts',
    dependencies
  );
  return {
    state,
    async invoke(
      body: unknown,
      options: {
        raw?: boolean;
        headers?: Record<string, string>;
        stream?: ReadableStream<Uint8Array<ArrayBuffer>>;
      } = {}
    ) {
      const request = new Request(
        'http://localhost/api/seller/products/synthetic-product',
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'content-type': 'application/json', ...options.headers },
          body:
            options.stream ??
            (options.raw ? String(body) : JSON.stringify(body)),
          ...(options.stream ? { duplex: 'half' } : {}),
        } as RequestInit
      );
      return mode === 'create'
        ? route.POST(request)
        : route.PUT(request, {
            params: Promise.resolve({ id: 'synthetic-product' }),
          });
    },
  };
}

async function rejected(
  mode: 'create' | 'update',
  body: unknown,
  status = 400,
  options: Parameters<ReturnType<typeof harness>['invoke']>[1] = {}
) {
  const test = harness(mode);
  const response = await test.invoke(body, options);
  assert.equal(
    response.status,
    status,
    `${mode} invalid input must return ${status}`
  );
  assert.equal(
    test.state.writes.length,
    0,
    'invalid input must not write products'
  );
  assert.equal(
    test.state.imageWrites.length,
    0,
    'invalid input must not write images'
  );
  assert.equal(
    test.state.productReads,
    0,
    'invalid input must be rejected before product lookup'
  );
  assert.equal(
    test.state.categoryReads,
    0,
    'invalid input must be rejected before category lookup'
  );
  assert.equal(test.state.jobs, 0, 'invalid input must not schedule AI work');
  assert.equal(test.state.providers, 0);
}

async function run() {
  for (const mode of ['create', 'update'] as const) {
    const base = mode === 'create' ? createBody : updateBody;
    const priceKey = mode === 'create' ? 'price' : 'priceToman';
    for (const field of [priceKey, 'stock']) {
      for (const value of [
        -1,
        1.25,
        '100',
        null,
        true,
        {},
        [],
        2_147_483_648,
        Number.MAX_SAFE_INTEGER,
        1e100,
      ]) {
        await rejected(mode, { ...base, [field]: value });
      }
    }
    const titleKey = mode === 'create' ? 'name' : 'title';
    for (const change of [
      { [titleKey]: 42 },
      { [titleKey]: '  ' },
      { [titleKey]: 'x'.repeat(201) },
      { [titleKey]: ' '.repeat(201) + 'Bowl' },
      { description: {} },
      { description: 'short' },
      { description: 'x'.repeat(5001) },
      { description: ' '.repeat(5001) + 'Handmade ceramic bowl' },
      { category: 'x'.repeat(81) },
      { category: {} },
      { tags: Array(21).fill('tag') },
      { tags: ['x'.repeat(81)] },
      { tags: [1] },
      { tags: 'x'.repeat(2001) },
      { useAI: 'false' },
      { useAI: null },
      { arbitrary: 'unrecognized-field' },
    ])
      await rejected(mode, { ...base, ...change });
    for (const malformed of [null, [], 'string'])
      await rejected(mode, malformed);
    await rejected(mode, '{"stock":', 400, { raw: true });
    await rejected(mode, base, 415, {
      headers: { 'content-type': 'text/plain' },
    });
    await rejected(mode, base, 413, {
      headers: { 'content-length': String(PRODUCT_INPUT_LIMITS.bodyBytes + 1) },
    });
    await rejected(mode, base, 400, { headers: { 'content-length': '-1' } });
    await rejected(mode, ' '.repeat(PRODUCT_INPUT_LIMITS.bodyBytes + 1), 413, {
      raw: true,
    });
    // A small declared length cannot bypass the actual streamed byte cap.
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.enqueue(new Uint8Array(32769).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    await rejected(mode, '', 413, {
      stream,
      headers: { 'content-length': '1' },
    });
    assert.equal(cancelled, true);
    for (const value of [0, PRODUCT_INPUT_LIMITS.postgresIntMax]) {
      const test = harness(mode);
      const response = await test.invoke({
        ...base,
        [priceKey]: value,
        stock: value,
      });
      assert.equal(response.status, 200);
      assert.equal(test.state.writes[0].priceToman, value);
      assert.equal(test.state.writes[0].stock, value);
      assert.equal(
        test.state.jobs,
        1,
        'existing background scheduling is preserved'
      );
      assert.equal(test.state.providers, 0);
    }
  }
  for (const mode of ['create', 'update'] as const) {
    const test = harness(mode);
    const key = mode === 'create' ? 'name' : 'title';
    const body = mode === 'create' ? createBody : updateBody;
    assert.equal(
      (await test.invoke({ ...body, [key]: 'A' })).status,
      200,
      'one-character craft names remain compatible with the existing form'
    );
  }
  for (const images of [
    Array(11).fill(createBody.images[0]),
    [{ url: 'javascript:alert(1)' }],
    [{ url: 'http://example.test/image.jpg' }],
    [{ url: 'https://user:pass@example.test/image.jpg' }],
    [{ url: 'https://example.test/image.jpg#fragment' }],
    [{ url: 123 }],
    [{ url: 'https://example.test/' + 'x'.repeat(2048) }],
    [{ ...createBody.images[0], sortOrder: -1 }],
    [{ ...createBody.images[0], sortOrder: 0.5 }],
    [{ ...createBody.images[0], alt: 'x'.repeat(201) }],
  ])
    await rejected('create', { ...createBody, images });
  await rejected('create', { ...createBody, slug: '../invalid' });
  await rejected('update', { ...updateBody, active: 'true' });
  await rejected('update', { ...updateBody, imageUrl: 'file:///image.jpg' });
  await rejected('update', { useAI: false });
  for (const field of ['name', 'description', 'price']) {
    const missing = { ...createBody } as Record<string, unknown>;
    delete missing[field];
    await rejected('create', missing);
  }
  const defaults = harness('create');
  assert.equal(
    (
      await defaults.invoke({
        name: createBody.name,
        description: createBody.description,
        price: 1,
      })
    ).status,
    200
  );
  assert.equal(defaults.state.writes[0].stock, 0);
  assert.equal(defaults.state.imageWrites.length, 0);
  const partial = harness('update');
  assert.equal((await partial.invoke({ stock: 0, active: false })).status, 200);
  assert.equal(partial.state.writes[0].active, false);
  assert.equal(partial.state.writes[0].title, undefined);
  // Cancellation cleanup cannot delay the error response indefinitely.
  const stalledCancellation = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(new Uint8Array(PRODUCT_INPUT_LIMITS.bodyBytes + 1));
    },
    cancel() {
      return new Promise(() => {});
    },
  });
  let cancelTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await assert.rejects(
      Promise.race([
        readProductInput(
          { headers: new Headers(), body: stalledCancellation },
          createProductSchema
        ),
        new Promise((_, reject) => {
          cancelTimer = setTimeout(
            () => reject(new Error('Cancellation stalled input rejection')),
            500
          );
        }),
      ]),
      (error: unknown) =>
        error instanceof ProductInputError && error.status === 413
    );
  } finally {
    clearTimeout(cancelTimer);
  }
  // Schema-level non-JSON numeric values must fail too, without coercion.
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      createProductSchema.safeParse({ ...createBody, price: value }).success,
      false
    );
    assert.equal(
      updateProductSchema.safeParse({ stock: value }).success,
      false
    );
  }
  assert.equal(
    createProductSchema.parse({ ...createBody, useAI: undefined }).useAI,
    true
  );
  assert.equal(updateProductSchema.parse({ stock: 0 }).useAI, true);
  // Persian byte counts and split UTF-8 chunks are decoded correctly.
  const persian = {
    ...createBody,
    name: 'سفال دست‌ساز',
    description: 'یک ظرف سفالی دست‌ساز زیبا',
  };
  const bytes = new TextEncoder().encode(JSON.stringify(persian));
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (let index = 0; index < bytes.length; index++)
        controller.enqueue(bytes.slice(index, index + 1));
      controller.close();
    },
  });
  const decoded = await readProductInput(
    { headers: new Headers(), body: stream },
    createProductSchema
  );
  assert.equal(decoded.name, persian.name);
  await assert.rejects(
    readProductInput(
      { headers: new Headers(), body: null },
      createProductSchema
    ),
    (error: unknown) =>
      error instanceof ProductInputError && error.status === 400
  );
  console.log(
    '✓ Seller create/edit input boundaries pass actual-route adversarial, range, size and compatibility regressions'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
