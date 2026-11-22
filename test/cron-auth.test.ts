import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/fx/update/route';

async function run() {
  // Rejection paths must finish before any provider fetch or database write.
  const previous = process.env.CRON_SECRET;
  const previousMode = process.env.KK_DEPLOYMENT_MODE;
  const previousVercel = process.env.VERCEL_ENV;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Unauthorized cron must not make external requests');
  };
  try {
    process.env.CRON_SECRET = 'synthetic-cron-secret';
    for (const mode of ['staging', 'preview']) {
      if (mode === 'staging') process.env.KK_DEPLOYMENT_MODE = 'staging';
      else {
        delete process.env.KK_DEPLOYMENT_MODE;
        process.env.VERCEL_ENV = 'preview';
      }
      for (const handler of [GET, POST]) {
        const response = await handler(
          new NextRequest('http://127.0.0.1/api/fx/update', {
            method: handler === POST ? 'POST' : 'GET',
            headers: { authorization: 'Bearer synthetic-cron-secret' },
          })
        );
        assert.equal(response.status, 503);
      }
    }
    delete process.env.KK_DEPLOYMENT_MODE;
    delete process.env.VERCEL_ENV;
    for (const handler of [GET, POST]) {
      for (const secret of [undefined, '', 'synthetic-cron-secret']) {
        if (secret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = secret;
        for (const authorization of [undefined, 'Bearer wrong']) {
          const response = await handler(
            new NextRequest('http://127.0.0.1/api/fx/update', {
              method: handler === POST ? 'POST' : 'GET',
              headers: authorization ? { authorization } : {},
            })
          );
          assert.equal(response.status, 401);
        }
      }
    }
    console.log(
      '✓ FX cron rejects missing configuration and unauthorized requests'
    );
  } finally {
    if (previousMode === undefined) delete process.env.KK_DEPLOYMENT_MODE;
    else process.env.KK_DEPLOYMENT_MODE = previousMode;
    if (previousVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercel;
    globalThis.fetch = previousFetch;
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
