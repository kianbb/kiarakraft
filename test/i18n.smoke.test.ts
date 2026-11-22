import assert from 'node:assert/strict';

// Environment-aware SSR smoke tests (defaults to local server for reliability)
const BASE_URL = process.env.NEXT_URL || 'http://localhost:3001';
const target = new URL(BASE_URL);
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
  throw new Error(
    'Smoke tests require the explicit local target provided by npm run test:i18n.'
  );
}

async function fetchHtml(url: string, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'accept-language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      assert.ok(
        res.ok,
        `Expected success from ${new URL(url).pathname}, got ${res.status}`
      );
      const html = await res.text();
      return html.slice(0, 12000);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw lastErr ?? new Error('Failed to fetch: ' + url);
}

async function mustInclude(url: string, markers: string[]) {
  const html = await fetchHtml(url);
  for (const m of markers) {
    assert.ok(html.includes(m), `Expected to find marker on ${url}: ${m}`);
  }
  console.log('OK:', url);
}

async function mustNotInclude(url: string, markers: string[]) {
  const html = await fetchHtml(url);
  for (const m of markers) {
    assert.ok(!html.includes(m), `Did not expect marker on ${url}: ${m}`);
  }
  console.log('OK (absent):', url);
}

async function redirectFrom(path: string) {
  const response = await fetch(new URL(path, target), {
    redirect: 'manual',
    headers: { 'accept-language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 307, `Expected proxy redirect from ${path}`);
  const location = response.headers.get('location');
  assert.ok(location, `Missing redirect location for ${path}`);
  const destination = new URL(location, target);
  assert.ok(['localhost', '127.0.0.1'].includes(destination.hostname));
  assert.equal(destination.port, target.port);
  return destination;
}

(async () => {
  try {
    await fetchHtml(`${BASE_URL}/api/health`, 1);
  } catch {
    throw new Error(
      'Local smoke-test server is unavailable; start npm run start:local first.'
    );
  }

  const defaultLocale = await redirectFrom('/explore?q=ceramic');
  assert.equal(defaultLocale.pathname, '/fa/explore');
  assert.equal(defaultLocale.searchParams.get('q'), 'ceramic');
  for (const locale of ['fa', 'en']) {
    for (const section of ['seller', 'admin']) {
      const pathname = `/${locale}/${section}`;
      const login = await redirectFrom(`${pathname}?from=local-smoke`);
      assert.equal(login.pathname, `/${locale}/auth/login`);
      const callback = login.searchParams.get('callbackUrl');
      assert.ok(callback, `Missing auth callback for ${pathname}`);
      assert.ok(
        callback.startsWith('/') && !callback.startsWith('//'),
        `Auth callback for ${pathname} must be a same-site relative path`
      );
      const callbackUrl = new URL(callback, login);
      assert.equal(callbackUrl.pathname, pathname);
      assert.equal(callbackUrl.searchParams.get('from'), 'local-smoke');
    }
  }
  const serviceWorker = await fetch(new URL('/sw.js', target), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(serviceWorker.status, 200);
  assert.equal(serviceWorker.headers.get('service-worker-allowed'), '/');
  await serviceWorker.body?.cancel();
  console.log('OK: locale and auth redirects, API and static asset bypass');

  // Lightweight checks (avoid brittle content coupling)
  await mustInclude(`${BASE_URL}/en`, ['<html lang="en" dir="ltr"']);
  await mustNotInclude(`${BASE_URL}/en`, [
    '\u06a9\u06cc\u0627\u0631\u0627 \u06a9\u0631\u0641\u062a',
  ]);

  await mustInclude(`${BASE_URL}/fa`, ['<html lang="fa" dir="rtl"']);
  await mustNotInclude(`${BASE_URL}/fa`, ['Featured Categories']);

  await mustInclude(`${BASE_URL}/en/explore`, ['<html lang="en"']);
  await mustInclude(`${BASE_URL}/fa/explore`, ['<html lang="fa"']);

  console.log('All i18n smoke tests passed');
})();
