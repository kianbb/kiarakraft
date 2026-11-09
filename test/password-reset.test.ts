import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as resets from '../lib/password-reset';
import { loadRoute } from './helpers/load-route';

type User = {
  id: string;
  email: string;
  name: string;
  password: string;
  passwordChangedAt: Date | null;
};
type Token = {
  id: string;
  userId: string;
  token: string;
  used: boolean;
  expiresAt: Date;
};
type State = { user: User; tokens: Token[]; sequence: number };
type ResetDatabase = Parameters<typeof resets.issuePasswordReset>[0];
type Handler = (request: NextRequest) => Promise<Response>;

// A rollback-aware in-memory adapter for actual helper/handler unit tests.
// PostgreSQL row-lock and concurrency semantics are tested separately.
function fixture() {
  let state: State = {
    user: {
      id: 'reset-unit-user',
      email: 'reset@example.invalid',
      name: 'Synthetic',
      password: 'synthetic-old-hash',
      passwordChangedAt: null,
    },
    tokens: [],
    sequence: 0,
  };
  let failWrite = false;
  let lookupFailure = false;
  let tokenReads = 0;
  const client = (get: () => State) => ({
    async $queryRaw(strings: TemplateStringsArray, id: string) {
      assert.match(strings.join('?'), /FOR UPDATE$/);
      return get().user.id === id ? [{ ...get().user }] : [];
    },
    user: {
      async findUnique({ where }: { where: { email?: string; id?: string } }) {
        if (lookupFailure) throw new Error('Synthetic lookup failure');
        return get().user.email === where.email || get().user.id === where.id
          ? { ...get().user }
          : null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<User>;
      }) {
        assert.equal(where.id, get().user.id);
        if (failWrite) throw new Error('synthetic-private-error-detail');
        Object.assign(get().user, data);
        return get().user;
      },
    },
    auditLog: { create: async () => ({}) },
    passwordResetToken: {
      async findUnique({ where }: { where: { token: string } }) {
        tokenReads++;
        const row = get().tokens.find(item => item.token === where.token);
        return row ? { ...row, user: { ...get().user } } : null;
      },
      async create({ data }: { data: Omit<Token, 'id' | 'used'> }) {
        const row = { ...data, id: `token-${++get().sequence}`, used: false };
        get().tokens.push(row);
        return row;
      },
      async updateMany({
        where,
      }: {
        where: Token & { expiresAt: { gt: Date } };
      }) {
        const row = get().tokens.find(
          item =>
            item.id === where.id &&
            item.userId === where.userId &&
            item.token === where.token &&
            !item.used &&
            item.expiresAt > where.expiresAt.gt
        );
        if (row) row.used = true;
        return { count: row ? 1 : 0 };
      },
      async deleteMany({
        where,
      }: {
        where: { userId: string; id?: { not: string } };
      }) {
        get().tokens = get().tokens.filter(
          item => item.userId !== where.userId || item.id === where.id?.not
        );
        return { count: 0 };
      },
    },
  });
  const database = {
    ...client(() => state),
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
      const pending = structuredClone(state);
      const result = await callback(client(() => pending));
      state = pending;
      return result;
    },
  } as unknown as ResetDatabase;
  return {
    database,
    state: () => state,
    reads: () => tokenReads,
    failWrite: (value: boolean) => {
      failWrite = value;
    },
    failLookup: (value: boolean) => {
      lookupFailure = value;
    },
  };
}

async function run() {
  const store = fixture();
  const sent: Array<{ resetUrl: string; locale: string }> = [];
  let deliveryFailed = false;
  let hashes = 0;
  const security = loadRoute<{
    validatePasswordComplexity: (password: string) => {
      valid: boolean;
      errors: string[];
    };
    validateEmail: (email: string) => boolean;
  }>('lib/auth-security.ts', {
    './prisma': { prisma: {} },
    './password-reset': resets,
  });
  const dependencies = {
    'next/server': { NextResponse },
    '@/lib/prisma': { prisma: store.database },
    '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
    '@/lib/rateLimit': {
      authRateLimit: {},
      withRateLimit: (_: unknown, handler: Handler) => handler,
    },
    '@/lib/password-reset': resets,
    '@/lib/auth-security': security,
    zod: { z },
    bcryptjs: {
      hash: async (_value: string, rounds: number) => {
        hashes++;
        assert.equal(rounds, 12);
        return 'synthetic-new-hash';
      },
    },
    '@/lib/email': {
      isValidEmail: () => true,
      checkEmailRateLimit: () => ({ allowed: true, remaining: 2 }),
      getResetUrl: (token: string, locale: string) =>
        `http://localhost/${locale}/reset-password?token=${token}`,
      sendEmail: async ({
        react,
      }: {
        react: { resetUrl: string; locale: string };
      }) => {
        sent.push(react);
        return { success: !deliveryFailed, error: 'synthetic-provider-detail' };
      },
    },
    '@/lib/email-templates/PasswordResetEmail': (props: unknown) => props,
  };
  const forgot = loadRoute<{ POST: Handler }>(
    'app/api/auth/forgot-password/route.ts',
    dependencies
  );
  const reset = loadRoute<{ POST: Handler; GET: Handler }>(
    'app/api/auth/reset-password/route.ts',
    dependencies
  );
  function request(path: string, body?: unknown) {
    return new NextRequest(
      `http://localhost/api/auth/${path}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
    );
  }
  const forgotRequest = (email: string) =>
    forgot.POST(request('forgot-password', { email, locale: 'en' }));
  const tokenFromMail = () =>
    new URL(sent.at(-1)!.resetUrl).searchParams.get('token')!;
  const password = 'Synthetic!62-choice';
  const resetRequest = (token: string, value = password) =>
    reset.POST(
      request('reset-password', {
        token,
        password: value,
        confirmPassword: value,
      })
    );

  const known = await forgotRequest('  RESET@EXAMPLE.INVALID  ');
  assert.equal(known.status, 200);
  const knownBody = await known.json();
  const first = tokenFromMail();
  assert.match(first, /^v1\.0\.[A-Za-z0-9_-]{43}$/);
  assert.equal(
    store.state().tokens[0].token,
    resets.passwordResetDigest(first)
  );
  assert.ok(
    !JSON.stringify(store.state().tokens).includes(first),
    'Only digests may be stored'
  );
  assert.equal(sent[0].locale, 'en');
  const unknown = await forgotRequest('missing@example.invalid');
  assert.deepEqual(await unknown.json(), knownBody);
  store.failLookup(true);
  assert.deepEqual(
    await (await forgotRequest('reset@example.invalid')).json(),
    knownBody
  );
  store.failLookup(false);
  deliveryFailed = true;
  assert.deepEqual(
    await (await forgotRequest('reset@example.invalid')).json(),
    knownBody
  );
  deliveryFailed = false;
  const current = tokenFromMail();
  assert.notEqual(current, first);
  assert.equal(
    (await reset.GET(request('reset-password?token=' + first))).status,
    400
  );
  const preview = await reset.GET(request('reset-password?token=' + current));
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal((await preview.json()).email, 'reset@example.invalid');

  // Legacy plaintext and database digests themselves are never usable bearers.
  const reads = store.reads();
  for (const invalid of [
    'a'.repeat(64),
    resets.passwordResetDigest(current)!,
    'v1.0.short',
    'x'.repeat(81),
  ]) {
    assert.equal((await resetRequest(invalid)).status, 400);
  }
  assert.equal(store.reads(), reads);
  assert.equal(hashes, 0);
  for (const invalid of ['x'.repeat(73), 'چ'.repeat(37)]) {
    assert.equal((await resetRequest(current, invalid)).status, 400);
  }
  assert.equal(hashes, 0, 'Oversized passwords must fail before bcrypt');

  const expiry = store.state().tokens[0].expiresAt;
  store.state().tokens[0].expiresAt = new Date(0);
  assert.equal((await resetRequest(current)).status, 400);
  assert.equal(
    (await reset.GET(request('reset-password?token=' + current))).status,
    400
  );
  store.state().tokens[0].expiresAt = expiry;
  store.state().tokens[0].used = true;
  assert.equal((await resetRequest(current)).status, 400);
  store.state().tokens[0].used = false;
  assert.equal(hashes, 0, 'Expired/used tokens must fail before bcrypt');
  const older = `v1.0.${randomBytes(32).toString('base64url')}`;
  store.state().tokens.push({
    id: 'older-link',
    userId: store.state().user.id,
    token: resets.passwordResetDigest(older)!,
    used: false,
    expiresAt: expiry,
  });

  const before = structuredClone(store.state());
  store.failWrite(true);
  assert.equal((await resetRequest(current)).status, 500);
  assert.deepEqual(
    store.state(),
    before,
    'Credential failure must roll back token claim'
  );
  store.failWrite(false);
  const succeeded = await resetRequest(current);
  assert.equal(succeeded.status, 200);
  assert.equal(store.state().user.password, 'synthetic-new-hash');
  assert.equal(store.state().tokens[0].used, true);
  assert.equal(
    store.state().tokens.length,
    1,
    'Recovery must invalidate all other links'
  );
  assert.equal((await resetRequest(older)).status, 400);
  assert.equal((await resetRequest(current)).status, 400);
  assert.equal(
    (await reset.GET(request('reset-password?token=' + current))).status,
    400
  );
  assert.equal(
    await resets.issuePasswordReset(
      store.database,
      store.state().user.id,
      0,
      Date.now()
    ),
    null,
    'A stale credential snapshot must not issue a link'
  );
  const version = store.state().user.passwordChangedAt!.getTime();
  assert.equal(
    await resets.issuePasswordReset(
      store.database,
      store.state().user.id,
      version,
      version
    ),
    null,
    'A request that began before recovery must not survive it'
  );

  // Header lies cannot bypass the streaming limit. No partial parsing/work.
  for (const handler of [forgot.POST, reset.POST]) {
    const body = JSON.stringify({
      email: 'reset@example.invalid',
      extra: 'x'.repeat(resets.MAX_RESET_BODY_BYTES),
    });
    const response = await handler(
      new NextRequest('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-length': '1' },
        body,
      })
    );
    assert.equal(response.status, 413);
    assert.equal(
      (
        await handler(
          new NextRequest('http://localhost/api/auth/reset-password', {
            method: 'POST',
            body: '{',
          })
        )
      ).status,
      400
    );
  }

  // An untrusted stream must not hold an oversized request open by leaving
  // cancel() pending. This tests the real bounded reader, not a copy.
  const hostile = new Request('http://localhost', {
    method: 'POST',
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(resets.MAX_RESET_BODY_BYTES + 1));
      },
      cancel: () => new Promise(() => {}),
    }),
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    resets.readResetBody(hostile),
    (error: unknown) =>
      error instanceof resets.ResetInputError && error.status === 413
  );

  const changing = fixture();
  const overtaken = fixture();
  const sentBefore = sent.length;
  const delayedForgot = loadRoute<{ POST: Handler }>(
    'app/api/auth/forgot-password/route.ts',
    {
      ...dependencies,
      '@/lib/prisma': { prisma: overtaken.database },
      '@/lib/rateLimit': {
        authRateLimit: {},
        withRateLimit:
          (_config: unknown, handler: Handler) =>
          async (request: NextRequest) => {
            overtaken.state().user.passwordChangedAt = new Date(Date.now() + 1);
            return handler(request);
          },
      },
    }
  );
  assert.equal(
    (
      await delayedForgot.POST(
        request('forgot-password', { email: 'reset@example.invalid' })
      )
    ).status,
    200
  );
  assert.equal(
    sent.length,
    sentBefore,
    'A request delayed by the limiter must not mint a link after recovery'
  );
  const legacyCurrent = 'legacy-current-'.repeat(10);
  const accountRoute = loadRoute<{ POST: Handler }>(
    'app/api/account/password/route.ts',
    {
      ...dependencies,
      '@/lib/prisma': { prisma: changing.database },
      '@/lib/auth': {
        auth: async () => ({ user: { id: changing.state().user.id } }),
      },
      bcryptjs: {
        compare: async (value: string) => {
          assert.equal(value, legacyCurrent);
          return true;
        },
        hash: async () => 'synthetic-changed-hash',
      },
    }
  );
  const freshPassword = 'Aa1!'.repeat(18);
  assert.equal(security.validatePasswordComplexity(freshPassword).valid, true);
  assert.equal(
    security.validatePasswordComplexity(freshPassword + 'x').valid,
    false
  );
  assert.equal(
    security.validatePasswordComplexity('Aa1!' + 'چx'.repeat(23)).valid,
    false
  );
  const changed = await accountRoute.POST(
    request('account/password', {
      currentPassword: legacyCurrent,
      newPassword: freshPassword,
      confirmPassword: freshPassword,
    })
  );
  assert.equal(
    changed.status,
    200,
    'A legacy current password above72 bytes must remain usable to select a bounded new password'
  );
  assert.equal(changing.state().user.password, 'synthetic-changed-hash');
  const register = loadRoute<{ POST: Handler }>(
    'app/api/auth/register/route.ts',
    {
      ...dependencies,
      '@/lib/db': { prisma: {} },
      '@/lib/captcha': { verifyHumanUser: async () => ({ isHuman: true }) },
    }
  );
  for (const tooLong of [freshPassword + 'x', 'Aa1!' + 'چx'.repeat(23)]) {
    const attempt = await accountRoute.POST(
      request('account/password', {
        currentPassword: legacyCurrent,
        newPassword: tooLong,
        confirmPassword: tooLong,
      })
    );
    assert.equal(attempt.status, 400);
    const registration = await register.POST(
      request('register', {
        email: 'new@example.invalid',
        password: tooLong,
        name: 'Synthetic',
      })
    );
    assert.equal(registration.status, 400);
  }
  const sessions = loadRoute<{
    isSessionValid: (id: string, version: number) => Promise<boolean>;
    invalidateUserSessions: (id: string) => Promise<void>;
  }>('lib/session-manager.ts', {
    '@/lib/prisma': { prisma: changing.database },
    'next/headers': { cookies: () => ({}) },
  });
  const previousVersion = changing.state().user.passwordChangedAt!.getTime();
  assert.equal(
    await sessions.isSessionValid(changing.state().user.id, previousVersion),
    true
  );
  assert.equal(
    await sessions.isSessionValid(changing.state().user.id, 0),
    false
  );
  await sessions.invalidateUserSessions(changing.state().user.id);
  assert.ok(
    changing.state().user.passwordChangedAt!.getTime() > previousVersion
  );
  assert.equal(
    await sessions.isSessionValid(changing.state().user.id, previousVersion),
    false
  );

  // Exercise the shared limiter wrapper too: reset GETs carry bearer tokens in
  // the query, so a denied request must never log the complete URL.
  const logged: string[] = [];
  const limiterExports: {
    withRateLimit?: (
      limiter: () => Promise<{
        allowed: boolean;
        remainingRequests: number;
        resetTime: number;
      }>,
      handler: Handler
    ) => Handler;
  } = {};
  const rateSource = readFileSync(
    new URL('../lib/rateLimit.ts', import.meta.url),
    'utf8'
  );
  const dependenciesForLimiter: Record<string, unknown> = {
    'next/server': { NextRequest },
    './prisma': { prisma: {} },
    '@/lib/auth': { auth: async () => null },
  };
  runInNewContext(
    ts.transpileModule(rateSource, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      exports: limiterExports,
      URL,
      Response,
      setInterval: () => 0,
      console: {
        ...console,
        warn: (...values: unknown[]) => logged.push(values.join(' ')),
      },
      require: (name: string) => {
        assert.ok(name in dependenciesForLimiter);
        return dependenciesForLimiter[name];
      },
    }
  );
  const denied = limiterExports.withRateLimit!(
    async () => ({
      allowed: false,
      remainingRequests: 0,
      resetTime: Date.now() + 1000,
    }),
    async () => assert.fail('Denied limiter must not invoke handler')
  );
  assert.equal(
    (await denied(request('reset-password?token=' + current))).status,
    429
  );
  assert.ok(logged.includes('Rate limit exceeded.'));
  assert.ok(logged.every(line => !line.includes('/api/auth/reset-password')));
  assert.ok(
    logged.every(
      line =>
        !line.includes(current) &&
        !line.includes('?token=') &&
        !line.includes('http://')
    )
  );
  console.log(
    '✓ Reset handlers: digest storage, legacy rejection, generic responses, bounded inputs, rollback and replay rejection'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
