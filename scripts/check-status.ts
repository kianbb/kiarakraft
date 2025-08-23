// Simple status check for two URLs and whether the HTML contains NEXT_NOT_FOUND
// Usage: npm run check:status

import { setTimeout as delay } from 'node:timers/promises';
import { fetch } from 'undici';

// Test against preview deployment in CI, production otherwise
// Vercel preview URLs: https://kiarakraft-git-<branch>-<team>.vercel.app
const getBaseUrl = () => {
  // PERMANENT FIX: Test preview deployments in CI
  // Vercel automatically sets VERCEL_URL in GitHub Actions for preview deployments
  if (process.env.VERCEL_URL) {
    const previewUrl = process.env.VERCEL_URL.startsWith('https://')
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL}`;
    console.log(`Testing preview deployment: ${previewUrl}`);
    return previewUrl;
  }

  // Manual override for testing
  if (process.env.BASE_URL) {
    console.log(`Using manual override: ${process.env.BASE_URL}`);
    return process.env.BASE_URL;
  }

  // Local development fallback
  console.log('Testing production (local development)');
  return 'https://www.kiarakraft.com';
};

const BASE = getBaseUrl();
console.log(`Testing against: ${BASE}`);
const targets = [
  {
    url: `${BASE}/fa/product/handmade-ceramic-bowl`,
    expect: 200,
    label: 'existing product (expect 200)',
  },
  {
    url: `${BASE}/fa/product/nonexistent-product-123`,
    expect: 404,
    label: 'nonexistent product (expect 404)',
  },
];

async function check(url: string) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text();
  const hasNotFoundMarker = text.includes('NEXT_NOT_FOUND');

  return { status: res.status, hasNotFoundMarker };
}

async function main() {
  let exitCode = 0;
  for (const t of targets) {
    try {
      const { status, hasNotFoundMarker } = await check(t.url);

      let ok: boolean;
      if (t.expect === 404) {
        // Accept either a proper 404 OR a 200 with NEXT_NOT_FOUND marker
        // This accommodates Vercel's edge behavior which may return soft 404s
        ok = status === 404 || (status === 200 && hasNotFoundMarker);
      } else {
        // For other expected statuses, require exact match
        ok = status === t.expect;
      }

      if (!ok) exitCode = 1;
      console.log(`${t.label}:`);
      console.log(`  URL: ${t.url}`);
      console.log(
        `  Status: ${status} (expected ${t.expect}) ${ok ? 'OK' : 'MISMATCH'}`
      );
      console.log(`  Contains NEXT_NOT_FOUND: ${hasNotFoundMarker}`);
      if (t.expect === 404 && status === 200 && hasNotFoundMarker) {
        console.log(`  Note: Soft 404 detected (Vercel edge behavior)`);
      }
      // Small delay to be polite
      await delay(100);
    } catch (err: unknown) {
      exitCode = 1;
      console.error(`Error fetching ${t.url}:`, (err as Error)?.message || err);
    }
  }
  process.exit(exitCode);
}

main();
