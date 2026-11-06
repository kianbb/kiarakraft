import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(
  new URL('../public/sw.js', import.meta.url),
  'utf8'
);
const origin = 'https://marketplace.invalid';

function worker() {
  const handlers = new Map();
  const stores = new Map();
  let network = async () => new Response('public asset');
  const key = request =>
    new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async request => store.get(key(request))?.clone(),
        put: async (request, response) =>
          store.set(key(request), response.clone()),
      };
    },
  };
  vm.runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    Request,
    Response,
    URL,
    console,
    fetch: request => network(request),
  });
  return {
    caches,
    stores,
    network: fn => {
      network = fn;
    },
    async dispatch(name, properties = {}) {
      let response;
      const pending = [];
      handlers.get(name)({
        ...properties,
        waitUntil: promise => pending.push(promise),
        respondWith: promise => {
          response = promise;
        },
      });
      await Promise.all(pending);
      return response;
    },
  };
}

test('activation deletes legacy private caches while preserving unrelated caches', async () => {
  const sw = worker();
  for (const name of [
    'kiarakraft-v2',
    'runtime',
    'kiarakraft-static-v3',
    'another-app',
  ]) {
    await sw.caches.open(name);
  }
  await sw.dispatch('activate');
  assert.deepEqual(await sw.caches.keys(), [
    'kiarakraft-static-v3',
    'another-app',
  ]);
});

test('API, RSC, account pages, uploads and external images never use Cache Storage', async () => {
  const sw = worker();
  for (const path of [
    '/api/account/data/export',
    '/api/orders',
    '/en/account/orders',
    '/en?_rsc=123',
    '/uploads/identity.png',
    'https://res.cloudinary.com/example/private.jpg',
  ]) {
    const request = new Request(new URL(path, origin));
    assert.equal(await sw.dispatch('fetch', { request }), undefined);
  }
  await sw.dispatch('message', {
    data: { type: 'CACHE_URLS', payload: ['/api/orders', '//other.invalid'] },
  });
  assert.equal(sw.stores.size, 0);
});

test('account switching cannot replay previous navigation content offline', async () => {
  const sw = worker();
  const request = new Request(`${origin}/en/account/orders`);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  sw.network(async () => new Response('buyer A private order'));
  assert.equal(
    await (await sw.dispatch('fetch', { request })).text(),
    'buyer A private order'
  );
  sw.network(async () => {
    throw new Error('offline after account switch');
  });
  const response = await sw.dispatch('fetch', { request });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /buyer A/);
});

test('only allowed static responses are cached, honoring privacy directives', async () => {
  for (const control of [
    'private, max-age=60',
    'public, no-store',
    'no-cache',
    'private="Set-Cookie"',
  ]) {
    const sw = worker();
    const request = new Request(`${origin}/_next/static/chunks/app.js`);
    sw.network(
      async () =>
        new Response('must not persist', {
          headers: { 'cache-control': control },
        })
    );
    await sw.dispatch('fetch', { request });
    assert.equal([...sw.stores.values()][0].size, 0);
  }
  const sw = worker();
  const request = new Request(`${origin}/_next/static/chunks/app.js`);
  await sw.dispatch('fetch', { request });
  sw.network(async () => {
    throw new Error('offline');
  });
  assert.equal(
    await (await sw.dispatch('fetch', { request })).text(),
    'public asset'
  );
  for (const headers of [{ authorization: 'Bearer synthetic' }]) {
    assert.equal(
      await sw.dispatch('fetch', {
        request: new Request(request, { headers }),
      }),
      undefined
    );
  }
});

test('offline navigation gets the public offline shell, never a cached signed-in page', async () => {
  const sw = worker();
  await sw.dispatch('install');
  sw.network(async () => {
    throw new Error('offline');
  });
  const request = new Request(`${origin}/fa/seller`);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  assert.equal(
    await (await sw.dispatch('fetch', { request })).text(),
    'public asset'
  );
});
