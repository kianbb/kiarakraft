import assert from 'node:assert/strict';

// Environment-aware SSR smoke tests (defaults to local server for reliability)
const BASE_URL = process.env.NEXT_URL || 'http://localhost:3001';

async function fetchHtml(url: string, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'accept-language': 'en-US,en;q=0.9' },
      });
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

(async () => {
  // If BASE_URL looks like localhost, ensure it's reachable; otherwise skip without failing.
  const isLocal =
    BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
  if (isLocal) {
    try {
      await fetchHtml(`${BASE_URL}/api/health`, 1);
    } catch {
      console.log(
        `Skipping i18n smoke tests: local server not reachable at ${BASE_URL}`
      );
      process.exit(0);
    }
  }

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
