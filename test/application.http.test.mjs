import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { localDir, safeEnvironment } from '../scripts/dev/environment.mjs';
import { connectLocal, verifyIdentity } from '../scripts/dev/database.mjs';

// This test uses real local HTTP authentication, never a manufactured session.
// The same database identity guard runs before credential reads or mutations.
const env = safeEnvironment({ kind: 'dev', nodeEnv: 'test' });
const origin = new URL(env.NEXT_URL).origin;
const fixture = {
  buyer: 'kk_local_buyer',
  seller: 'kk_local_seller',
  shop: 'kk_local_shop',
  product: 'kk_local_bowl',
};
const nonce = randomUUID();
const privateSentinel = `private-http-smoke-${nonce}`;
const clientIP = `127.${parseInt(nonce.slice(0, 2), 16)}.${parseInt(nonce.slice(2, 4), 16)}.${parseInt(nonce.slice(4, 6), 16)}`;
const privateKeys = [
  'password',
  'passwordChangedAt',
  'verificationNotes',
  'nationalIdHash',
  'docsFolder',
];

function assertPrivateJSON(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!privateKeys.includes(key), `Private JSON field exposed: ${key}`);
    assertPrivateJSON(child);
  }
}

function browser() {
  const cookies = new Map();
  return async (relativePath, options = {}) => {
    const target = new URL(relativePath, origin);
    assert.equal(
      target.origin,
      origin,
      'Off-origin HTTP requests are forbidden'
    );
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.protocol, 'http:');
    const headers = new Headers(options.headers);
    headers.set('x-forwarded-for', clientIP);
    if (cookies.size)
      headers.set(
        'cookie',
        [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
      );
    let response;
    try {
      response = await fetch(target, {
        ...options,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        `Local HTTP request failed or redirected at ${target.pathname}`
      );
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    const text = await response.text();
    assert.ok(
      response.status < 500,
      `Application returned HTTP ${response.status} at ${target.pathname}`
    );
    assert.ok(
      !text.includes(privateSentinel),
      `Private seller data exposed at ${target.pathname}`
    );
    return {
      status: response.status,
      headers: response.headers,
      text,
      json: () => JSON.parse(text),
    };
  };
}

async function run() {
  const client = await connectLocal(env.DATABASE_URL, env.KK_DATABASE_KIND);
  let baseline;
  let modified = false;
  try {
    await verifyIdentity(client, env.KK_DATABASE_KIND);
    const users = (
      await client.query(
        'SELECT id, email, role FROM "User" WHERE id = ANY($1::text[]) ORDER BY id',
        [[fixture.buyer, fixture.seller]]
      )
    ).rows;
    assert.equal(users.length, 2, 'Synthetic buyer and seller must exist');
    for (const role of ['BUYER', 'SELLER']) {
      const user = users.find(row => row.id === fixture[role.toLowerCase()]);
      assert.ok(
        user?.role === role &&
          user.email === `${role.toLowerCase()}@kiarakraft.invalid`,
        'Refusing non-fixture account'
      );
    }
    const shops = (
      await client.query(
        'SELECT id, "userId", handle, "verificationNotes", "docsFolder", "nationalIdHash" FROM "SellerProfile" WHERE id = $1 AND "userId" = $2',
        [fixture.shop, fixture.seller]
      )
    ).rows;
    assert.ok(
      shops.length === 1 && shops[0].handle === 'synthetic-studio',
      'Refusing non-fixture seller'
    );
    const products = (
      await client.query(
        'SELECT id, "sellerId", slug, stock, active, "isTest", "eligibilityStatus" FROM "Product" WHERE id = $1',
        [fixture.product]
      )
    ).rows;
    assert.ok(
      products.length === 1 &&
        products[0].sellerId === fixture.shop &&
        products[0].slug === 'synthetic-ceramic-bowl' &&
        products[0].active &&
        !products[0].isTest &&
        products[0].eligibilityStatus === 'APPROVED' &&
        products[0].stock >= 2,
      'Refusing missing or changed synthetic product'
    );
    const carts = (
      await client.query(
        'SELECT * FROM "Cart" WHERE "userId" = ANY($1::text[]) ORDER BY "userId"',
        [[fixture.buyer, fixture.seller]]
      )
    ).rows;
    const cartItems = (
      await client.query(
        'SELECT i.* FROM "CartItem" i JOIN "Cart" c ON c.id = i."cartId" WHERE c."userId" = ANY($1::text[]) AND i."productId" = $2 ORDER BY i.id',
        [[fixture.buyer, fixture.seller], fixture.product]
      )
    ).rows;
    baseline = { shop: shops[0], carts, cartItems };

    const credentialPath = path.join(localDir, 'credentials.json');
    const credentialStat = statSync(credentialPath);
    assert.ok(
      credentialStat.isFile() &&
        (credentialStat.mode & 0o077) === 0 &&
        credentialStat.uid === process.getuid(),
      'Synthetic credential file must be owner-only'
    );
    const { password } = JSON.parse(readFileSync(credentialPath, 'utf8'));
    assert.ok(
      typeof password === 'string' && password.length >= 12,
      'Synthetic login credentials unavailable'
    );

    await client.query('BEGIN');
    try {
      const changed = await client.query(
        'UPDATE "SellerProfile" SET "verificationNotes"=$1, "docsFolder"=$1, "nationalIdHash"=$1 WHERE id=$2 AND "userId"=$3',
        [privateSentinel, fixture.shop, fixture.seller]
      );
      assert.equal(changed.rowCount, 1);
      for (const [role, quantity] of [
        ['buyer', 1],
        ['seller', 2],
      ]) {
        const cartId =
          baseline.carts.find(cart => cart.userId === fixture[role])?.id ??
          `http-smoke-${nonce}-${role}`;
        await client.query(
          'INSERT INTO "Cart" (id, "userId", "createdAt", "updatedAt") VALUES ($1,$2,NOW(),NOW()) ON CONFLICT ("userId") DO NOTHING',
          [cartId, fixture[role]]
        );
        await client.query(
          'INSERT INTO "CartItem" (id, "cartId", "productId", quantity) VALUES ($1,$2,$3,$4) ON CONFLICT ("cartId", "productId") DO UPDATE SET quantity=EXCLUDED.quantity',
          [
            `http-smoke-item-${nonce}-${role}`,
            cartId,
            fixture.product,
            quantity,
          ]
        );
      }
      await client.query('COMMIT');
      modified = true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const anonymous = browser();
    const health = await anonymous('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json().services.database, 'connected');
    assert.match(health.headers.get('cache-control'), /no-store/);

    async function login(role) {
      const request = browser();
      const csrf = await request('/api/auth/csrf');
      assert.equal(csrf.status, 200);
      assert.ok(typeof csrf.json().csrfToken === 'string');
      const signedIn = await request('/api/auth/callback/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
          Origin: origin,
          Referer: `${origin}/en/auth/login`,
        },
        body: new URLSearchParams({
          csrfToken: csrf.json().csrfToken,
          email: `${role}@kiarakraft.invalid`,
          password,
          callbackUrl: `${origin}/en`,
        }),
      });
      assert.equal(signedIn.status, 200, 'Real credentials login failed');
      const destination = new URL(signedIn.json().url);
      const authError = destination.searchParams.get('error');
      assert.ok(
        !authError,
        `Credentials login returned ${authError && /^[A-Za-z]{1,40}$/.test(authError) ? authError : 'an authentication error'}`
      );
      assert.equal(
        destination.origin,
        origin,
        'Credentials login returned an off-origin destination'
      );
      const session = await request('/api/auth/session');
      assert.equal(session.status, 200);
      const sessionValue = session.json();
      assert.ok(
        sessionValue && typeof sessionValue === 'object',
        'Authenticated session missing after credentials login'
      );
      assert.equal(sessionValue.user?.id, fixture[role]);
      assert.equal(sessionValue.user?.role, role.toUpperCase());
      assertPrivateJSON(sessionValue);
      return request;
    }
    const buyer = await login('buyer');
    const seller = await login('seller');
    assert.equal(
      (await anonymous('/api/auth/session')).json()?.user,
      undefined
    );

    let missingPrivateCartHeader = false;
    for (const [request, quantity] of [
      [buyer, 1],
      [seller, 2],
      [buyer, 1],
    ]) {
      const cart = await request('/api/cart');
      assert.equal(cart.status, 200);
      assertPrivateJSON(cart.json());
      const item = cart.json().find(row => row.productId === fixture.product);
      assert.ok(
        item && item.quantity === quantity,
        'Cart crossed account boundaries or server uses another database'
      );
      assert.equal(item.product.seller.id, fixture.shop);
      if (!/no-store/.test(cart.headers.get('cache-control') ?? ''))
        missingPrivateCartHeader = true;
    }
    assert.equal((await anonymous('/api/cart')).status, 401);
    assert.equal(
      (await seller(`/api/seller/products/${fixture.product}/get`)).status,
      200
    );
    assert.equal(
      (await buyer(`/api/seller/products/${fixture.product}/get`)).status,
      401
    );
    const missingOrder = `/api/orders/http-smoke-missing-${nonce}`;
    assert.equal((await buyer(missingOrder)).status, 404);
    assert.equal((await anonymous(missingOrder)).status, 401);
    for (const method of ['GET', 'POST'])
      assert.equal((await anonymous('/api/fx/update', { method })).status, 401);

    for (const locale of ['fa', 'en']) {
      const product = await anonymous(
        `/api/products/${fixture.product}?locale=${locale}`
      );
      assert.equal(product.status, 200);
      assert.equal(product.json().id, fixture.product);
      assert.equal(product.json().seller.id, fixture.shop);
      assertPrivateJSON(product.json());
      for (const route of [
        `/${locale}/product/synthetic-ceramic-bowl`,
        `/${locale}/shop/synthetic-studio`,
      ]) {
        const html = await anonymous(`${route}?applicationSmoke=${nonce}`);
        assert.equal(html.status, 200);
        assert.match(html.headers.get('content-type'), /text\/html/);
        assert.match(html.text, new RegExp(`<html[^>]*lang="${locale}"`));
        assert.match(
          html.text,
          new RegExp(`<html[^>]*dir="${locale === 'fa' ? 'rtl' : 'ltr'}"`)
        );
        assert.ok(
          html.text.includes('synthetic-ceramic-bowl') ||
            html.text.includes(fixture.product)
        );
        const expectedContent = route.includes('/product/')
          ? product.json().title
          : 'Synthetic Artisan';
        assert.ok(
          typeof expectedContent === 'string' && expectedContent.length > 0
        );
        assert.ok(
          html.text.includes(expectedContent),
          'Fixture content missing from rendered HTML'
        );
        // Next 16 validates the RSC cache key against router headers. A full
        // RSC request without state/prefetch headers has the empty cache key.
        const rsc = await anonymous(
          `${route}?applicationSmoke=${nonce}&_rsc=`,
          {
            headers: { RSC: '1' },
          }
        );
        assert.equal(rsc.status, 200);
        assert.match(rsc.headers.get('content-type'), /text\/x-component/);
        assert.ok(
          rsc.text.includes('synthetic-ceramic-bowl') ||
            rsc.text.includes(fixture.product)
        );
        assert.ok(
          rsc.text.includes(expectedContent),
          'Fixture content missing from rendered RSC'
        );
        // HTML/RSC contain legitimate translated field labels. Sentinel values,
        // rather than generic words such as "password", detect actual leakage.
      }
    }
    assert.ok(
      !missingPrivateCartHeader,
      'Authenticated cart response must be private/no-store'
    );
  } finally {
    try {
      if (modified) {
        // Restore verification data independently, even if a concurrent cart
        // change makes the later cart cleanup refuse to delete anything.
        const restored = await client.query(
          'UPDATE "SellerProfile" SET "verificationNotes"=$1, "docsFolder"=$2, "nationalIdHash"=$3 WHERE id=$4 AND "userId"=$5',
          [
            baseline.shop.verificationNotes,
            baseline.shop.docsFolder,
            baseline.shop.nationalIdHash,
            fixture.shop,
            fixture.seller,
          ]
        );
        assert.equal(
          restored.rowCount,
          1,
          'Synthetic seller disappeared before cleanup'
        );
        await client.query('BEGIN');
        try {
          for (const role of ['buyer', 'seller']) {
            const oldCart = baseline.carts.find(
              cart => cart.userId === fixture[role]
            );
            const cartId = oldCart?.id ?? `http-smoke-${nonce}-${role}`;
            const oldItem = baseline.cartItems.find(
              item => item.cartId === cartId
            );
            if (oldItem)
              await client.query(
                'UPDATE "CartItem" SET quantity=$1 WHERE id=$2 AND "cartId"=$3 AND "productId"=$4',
                [oldItem.quantity, oldItem.id, cartId, fixture.product]
              );
            else
              await client.query(
                'DELETE FROM "CartItem" WHERE "cartId"=$1 AND "productId"=$2',
                [cartId, fixture.product]
              );
            if (!oldCart) {
              const deleted = await client.query(
                'DELETE FROM "Cart" WHERE id=$1 AND "userId"=$2 AND NOT EXISTS (SELECT 1 FROM "CartItem" WHERE "cartId"=$1)',
                [cartId, fixture[role]]
              );
              assert.equal(
                deleted.rowCount,
                1,
                'Refusing to remove a concurrently changed fixture cart'
              );
            }
          }
          await client.query('DELETE FROM "RateLimit" WHERE identifier=$1', [
            `ip_attempts:${clientIP}`,
          ]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        const shop = (
          await client.query(
            'SELECT id, "userId", handle, "verificationNotes", "docsFolder", "nationalIdHash" FROM "SellerProfile" WHERE id=$1 AND "userId"=$2',
            [fixture.shop, fixture.seller]
          )
        ).rows[0];
        const carts = (
          await client.query(
            'SELECT * FROM "Cart" WHERE "userId" = ANY($1::text[]) ORDER BY "userId"',
            [[fixture.buyer, fixture.seller]]
          )
        ).rows;
        const cartItems = (
          await client.query(
            'SELECT i.* FROM "CartItem" i JOIN "Cart" c ON c.id=i."cartId" WHERE c."userId" = ANY($1::text[]) AND i."productId"=$2 ORDER BY i.id',
            [[fixture.buyer, fixture.seller], fixture.product]
          )
        ).rows;
        assert.ok(
          JSON.stringify({ shop, carts, cartItems }) ===
            JSON.stringify(baseline),
          'Synthetic fixture baseline was not restored exactly'
        );
      }
    } finally {
      await client.end();
    }
  }
  console.log(
    '✓ local HTTP auth, ownership, cart isolation, and fa/en HTML/RSC privacy smoke passed; fixture baseline restored'
  );
}

run().catch(error => {
  console.error(`Application HTTP smoke failed: ${error.message}`);
  process.exitCode = 1;
});
