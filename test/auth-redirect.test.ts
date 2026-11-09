import assert from 'node:assert/strict';
import { createCanonicalRedirect } from '../lib/auth-config';

async function run() {
  for (const origin of [
    'http://127.0.0.1:3000',
    'https://market.example.invalid',
  ]) {
    const redirect = createCanonicalRedirect(origin);
    const context = { baseUrl: 'http://localhost:3000' };
    assert.equal(await redirect({ ...context, url: '/en' }), `${origin}/en`);
    assert.equal(
      await redirect({ ...context, url: `${origin}/fa/account` }),
      `${origin}/fa/account`
    );
    for (const url of [
      'https://other.invalid',
      '//other.invalid',
      '\\\\other.invalid',
      'javascript:alert(1)',
      'http://localhost:3000/en',
      `${origin}.other.invalid/`,
      'https://market.example.invalid@other.invalid/',
      `${origin.replace(/:\d+$/, '')}:4444/fa`,
      origin.replace('://', '://user:password@') + '/fa',
    ]) {
      assert.equal(
        await redirect({ ...context, url }),
        origin,
        `Unsafe redirect must return to the configured app origin`
      );
    }
  }
  const fallback = createCanonicalRedirect();
  assert.equal(
    await fallback({ baseUrl: 'https://app.invalid', url: '/fa' }),
    'https://app.invalid/fa'
  );
  await assert.rejects(async () =>
    createCanonicalRedirect('javascript:alert(1)')({
      baseUrl: 'https://app.invalid',
      url: '/fa',
    })
  );
  console.log(
    '✓ Auth redirects preserve configured origin and reject external destinations'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
