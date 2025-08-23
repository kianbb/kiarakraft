// Simple status check for two URLs and whether the HTML contains NEXT_NOT_FOUND
// Usage: npm run check:status

import { setTimeout as delay } from 'node:timers/promises';
import { fetch } from 'undici';

// Test against preview deployment in CI, production otherwise
// Vercel preview URLs: https://kiarakraft-git-<branch>-<team>.vercel.app
const getBaseUrl = () => {
  // If we have a Vercel preview URL (from CI environment or manual override)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // If we have a custom base URL override
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // In CI (GitHub Actions), construct preview URL from branch
  if (process.env.CI && process.env.GITHUB_HEAD_REF) {
    const branch = process.env.GITHUB_HEAD_REF.replace(/[^a-z0-9-]/g, '-');
    return `https://kiarakraft-git-${branch}-kianbb.vercel.app`;
  }

  // Fallback to production (for local testing)
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
        // For 404 cases, accept either a proper 404 OR a 200 with NEXT_NOT_FOUND marker
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
