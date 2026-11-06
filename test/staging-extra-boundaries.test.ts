import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
import crypto from 'node:crypto';

type Env = Record<string, string | undefined>;
type Response = { status: number; data: Record<string, unknown> };

function load<T>(
  filename: string,
  env: Env,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {}
): T {
  const compile = (file: string) =>
    ts.transpileModule(
      readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }
    ).outputText;
  const policy = {};
  runInNewContext(compile('lib/deployment-policy.ts'), {
    exports: policy,
    process: { env },
    URL,
  });
  const modules = {
    './deployment-policy': policy,
    '@/lib/deployment-policy': policy,
  };
  const exports = {};
  runInNewContext(compile(filename), {
    exports,
    require(name: string) {
      if (name in modules) return modules[name as keyof typeof modules];
      assert.ok(
        name in dependencies,
        `Unexpected boundary dependency: ${name}`
      );
      return dependencies[name];
    },
    process: { env },
    URLSearchParams,
    Buffer,
    console: { log() {}, warn() {}, error() {} },
    ...globals,
  });
  return exports as T;
}

function push(env: Env) {
  const calls = { auth: 0, database: 0, body: 0, rateLimit: 0, csrf: 0 };
  const route = load<{
    GET(): Promise<Response>;
    POST(request: { json(): Promise<object> }): Promise<Response>;
  }>('app/api/push/subscribe/route.ts', env, {
    'next/server': {
      NextResponse: {
        json: (data: Response['data'], options?: { status: number }) => ({
          data,
          status: options?.status ?? 200,
        }),
      },
    },
    '@/lib/auth': {
      auth: async () => {
        calls.auth++;
        return { user: { id: 'synthetic-user' } };
      },
    },
    '@/lib/prisma': {
      prisma: {
        pushSubscription: {
          upsert: async () => {
            calls.database++;
            return { id: 'synthetic-subscription' };
          },
        },
      },
    },
    '@/lib/rateLimit': {
      authRateLimit: {},
      withRateLimit:
        (_limiter: unknown, handler: (request: unknown) => unknown) =>
        (request: unknown) => {
          calls.rateLimit++;
          return handler(request);
        },
    },
    '@/lib/csrf': {
      withCSRF:
        (handler: (request: unknown) => unknown) => (request: unknown) => {
          calls.csrf++;
          return handler(request);
        },
    },
    zod,
  });
  const request = {
    json: async () => {
      calls.body++;
      return {
        endpoint: 'https://push.example.invalid/synthetic',
        keys: { p256dh: 'synthetic', auth: 'synthetic' },
      };
    },
  };
  return { route, calls, request };
}

function captcha(env: Env) {
  let requests = 0;
  const loadedModule = load<{
    verifyTurnstileToken(
      token: string,
      ip?: string
    ): Promise<{ success: boolean }>;
    verifyHumanUser(request: {
      turnstileToken?: string;
      honeypot?: string;
      headers: Headers;
      ip?: string;
    }): Promise<{ isHuman: boolean }>;
  }>(
    'lib/captcha.ts',
    env,
    {},
    {
      fetch: async (url: string, options: { body: URLSearchParams }) => {
        requests++;
        assert.equal(
          url,
          'https://challenges.cloudflare.com/turnstile/v0/siteverify'
        );
        assert.equal(options.body.get('secret'), 'synthetic-captcha-key');
        return { json: async () => ({ success: true }) };
      },
    }
  );
  return { module: loadedModule, requestCount: () => requests };
}

function seed(env: Env, admin = true, providedToken = env.SEED_TOKEN) {
  const calls = { auth: 0, headers: 0, imports: 0, seed: 0 };
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (data: Response['data'], options?: { status: number }) => ({
          data,
          status: options?.status ?? 200,
        }),
      },
    },
    '@/lib/auth': {
      auth: async () => {
        calls.auth++;
        return admin ? { user: { role: 'ADMIN' } } : null;
      },
    },
    crypto,
    get '@/prisma/seed-production'() {
      calls.imports++;
      return {
        seedProduction: async () => {
          calls.seed++;
          return {};
        },
      };
    },
  };
  const route = load<{
    POST(request: {
      headers: { get(name: string): string | null };
    }): Promise<Response>;
  }>('app/api/admin/seed/route.ts', env, dependencies);
  return {
    route,
    calls,
    request: {
      headers: {
        get: (name: string) => {
          calls.headers++;
          return name === 'x-seed-token' ? providedToken || null : null;
        },
      },
    },
  };
}

function images(env: Env) {
  const calls = { dns: 0, fetch: 0, sharp: 0 };
  const loadedModule = load<{
    resizeImageTo1024(url: string): Promise<string | null>;
    getImageMetadata(url: string): Promise<object | null>;
    resizeImageBufferTo1024(buffer: Buffer): Promise<string | null>;
  }>(
    'lib/image-resizer.ts',
    env,
    {
      './url-validator': {
        validateURL: async (url: string) => {
          calls.dns++;
          return { isValid: true, sanitizedURL: url };
        },
      },
      'node-fetch': async () => {
        calls.fetch++;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      },
      sharp: () => {
        calls.sharp++;
        const builder = {
          resize: () => builder,
          jpeg: () => builder,
          toBuffer: async () => Buffer.from('synthetic-image'),
          metadata: async () => ({ width: 1, height: 1, format: 'png' }),
        };
        return builder;
      },
    },
    { AbortController, setTimeout, clearTimeout }
  );
  return { module: loadedModule, calls };
}

async function run() {
  const liveKeys = {
    VAPID_PUBLIC_KEY: 'synthetic-public-key',
    VAPID_PRIVATE_KEY: 'synthetic-private-key',
    TURNSTILE_SECRET_KEY: 'synthetic-captcha-key',
    NODE_ENV: 'production',
    ENABLE_SEED_ENDPOINT: 'true',
    SEED_TOKEN: 'test-seed-token-with-at-least-32-characters',
  };
  const human = {
    headers: new Headers({
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'fa',
      'accept-encoding': 'gzip',
    }),
    turnstileToken: 'synthetic-token',
    ip: '192.0.2.1',
  };
  for (const mode of [
    { KK_DEPLOYMENT_MODE: 'staging' },
    { VERCEL_ENV: 'preview' },
    { KK_DEPLOYMENT_MODE: 'staging', VERCEL_ENV: 'production' },
  ]) {
    const env = { ...liveKeys, ...mode };
    const p = push(env);
    assert.equal((await p.route.GET()).status, 503);
    assert.equal((await p.route.POST(p.request)).status, 503);
    assert.deepEqual(p.calls, {
      auth: 0,
      database: 0,
      body: 0,
      rateLimit: 0,
      csrf: 0,
    });
    const c = captcha(env);
    assert.equal(
      (await c.module.verifyTurnstileToken(human.turnstileToken, human.ip))
        .success,
      false
    );
    assert.equal((await c.module.verifyHumanUser(human)).isHuman, true);
    assert.equal(
      (await c.module.verifyHumanUser({ ...human, honeypot: 'synthetic-bot' }))
        .isHuman,
      false
    );
    assert.equal(
      (
        await c.module.verifyHumanUser({
          ...human,
          headers: new Headers({ 'user-agent': 'synthetic-bot' }),
        })
      ).isHuman,
      false
    );
    assert.equal(c.requestCount(), 0);

    const s = seed(env);
    assert.equal((await s.route.POST(s.request)).status, 404);
    assert.deepEqual(s.calls, { auth: 0, headers: 0, imports: 0, seed: 0 });

    const i = images(env);
    assert.equal(
      await i.module.resizeImageTo1024('https://images.example.invalid/a.png'),
      null
    );
    assert.equal(
      await i.module.getImageMetadata('https://images.example.invalid/a.png'),
      null
    );
    assert.deepEqual(i.calls, { dns: 0, fetch: 0, sharp: 0 });
    assert.ok(await i.module.resizeImageBufferTo1024(Buffer.from('synthetic')));
    assert.deepEqual(i.calls, { dns: 0, fetch: 0, sharp: 1 });
  }

  // Positive controls prove the spies exercise the ordinary execution paths.
  const standard = { ...liveKeys, KK_DEPLOYMENT_MODE: 'production' };
  const p = push(standard);
  assert.equal((await p.route.GET()).data.publicKey, liveKeys.VAPID_PUBLIC_KEY);
  assert.equal((await p.route.POST(p.request)).status, 200);
  assert.deepEqual(p.calls, {
    auth: 1,
    database: 1,
    body: 1,
    rateLimit: 1,
    csrf: 1,
  });
  const c = captcha(standard);
  assert.equal((await c.module.verifyHumanUser(human)).isHuman, true);
  assert.equal(c.requestCount(), 1);

  for (const [env, admin, status] of [
    [{ ...standard, ENABLE_SEED_ENDPOINT: 'false' }, true, 404],
    [standard, false, 401],
    [{ ...standard, SEED_TOKEN: '' }, true, 500],
  ] as const) {
    const denied = seed(env, admin);
    assert.equal((await denied.route.POST(denied.request)).status, status);
    assert.equal(denied.calls.imports, 0);
    assert.equal(denied.calls.seed, 0);
  }
  const wrongToken = seed(standard, true, 'synthetic-wrong-token');
  assert.equal((await wrongToken.route.POST(wrongToken.request)).status, 401);
  assert.equal(wrongToken.calls.imports, 0);
  assert.equal(wrongToken.calls.seed, 0);
  const s = seed(standard);
  assert.equal((await s.route.POST(s.request)).status, 200);
  assert.equal(s.calls.imports, 1);
  assert.equal(s.calls.seed, 1);

  const i = images(standard);
  assert.ok(
    await i.module.resizeImageTo1024('https://images.example.invalid/a.png')
  );
  assert.ok(
    await i.module.getImageMetadata('https://images.example.invalid/a.png')
  );
  assert.deepEqual(i.calls, { dns: 4, fetch: 2, sharp: 2 });
  console.log(
    '✓ Staging denies push, seed imports and remote image work; CAPTCHA keeps local checks without external requests'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
