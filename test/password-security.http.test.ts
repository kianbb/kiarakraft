import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { safeEnvironment } from '../scripts/dev/environment.mjs';
import { connectLocal, verifyIdentity } from '../scripts/dev/database.mjs';

let phase = 'local identity verification';

async function run() {
  const env = safeEnvironment({
    kind: 'dev',
    nodeEnv: 'test',
  }) as unknown as Record<string, string>;
  const url = new URL(env.NEXT_URL);
  assert.ok(
    url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      !url.username &&
      !url.password,
    'Account HTTP tests require a literal HTTP loopback origin'
  );
  const origin = url.origin;
  const identity = await connectLocal(env.DATABASE_URL, env.KK_DATABASE_KIND);
  try {
    await verifyIdentity(identity, env.KK_DATABASE_KIND);
  } finally {
    await identity.end();
  }

  // No Prisma runtime/client or writable fixture is created before the marked
  // local database is verified. Explicit constructor URL also prevents fallback
  // to an inherited environment/legacy dotenv connection.
  const { PrismaClient: Client } = await import('@prisma/client');
  const { issuePasswordReset } = await import('../lib/password-reset');
  const bcrypt = await import('bcryptjs');
  const database: PrismaClient = new Client({
    datasourceUrl: env.DATABASE_URL,
  });
  const id = `password-http-${randomUUID()}`;
  const email = `${id}@example.invalid`;
  // Separator placement ensures these random fixture passwords satisfy the
  // existing pattern policy while remaining below bcrypt's72-byte boundary.
  const password = () =>
    `Qz7!${[...randomBytes(16).toString('hex')].join('-')}`;
  const originalPassword = password();
  const resetPassword = password();
  const changedPassword = password();
  let fixtureCreated = false;
  let ownedRateIdentifiers: string[] = [];

  try {
    phase = 'synthetic fixture creation';
    let clientIP = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = randomBytes(3);
      const candidate = `127.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
      const identifiers = [
        `ip_attempts:${candidate}`,
        `login_attempts:${email}`,
        `account_lock:${email}`,
        `ip:${candidate}:/api/auth/reset-password`,
        `ip:${candidate}:/api/account/password`,
        `user:${id}:/api/account/password`,
      ];
      if (
        (await database.rateLimit.count({
          where: { identifier: { in: identifiers } },
        })) === 0
      ) {
        clientIP = candidate;
        ownedRateIdentifiers = identifiers;
        break;
      }
    }
    assert.ok(clientIP, 'A fresh synthetic rate-limit identity is required');
    await database.user.create({
      data: {
        id,
        email,
        name: 'Synthetic password HTTP regression',
        role: 'BUYER',
        password: await bcrypt.hash(originalPassword, 4),
      },
    });
    fixtureCreated = true;

    function browser() {
      const cookies = new Map<string, string>();
      const cookieHeader = () =>
        [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      return {
        cookieHeader,
        async request(
          path: string,
          options: RequestInit = {},
          frozenCookie?: string
        ) {
          const target = new URL(path, origin);
          assert.ok(
            target.origin === origin &&
              target.hostname === '127.0.0.1' &&
              target.protocol === 'http:',
            'Off-origin HTTP requests are forbidden'
          );
          const headers = new Headers(options.headers);
          headers.set('x-forwarded-for', clientIP);
          const cookie = frozenCookie ?? cookieHeader();
          if (cookie) headers.set('cookie', cookie);
          let response: Response;
          try {
            response = await fetch(target, {
              ...options,
              headers,
              redirect: 'error',
              signal: AbortSignal.timeout(20000),
            });
          } catch {
            throw new Error('Local HTTP request failed or redirected');
          }
          for (const entry of response.headers.getSetCookie()) {
            const pair = entry.split(';')[0];
            const separator = pair.indexOf('=');
            const name = pair.slice(0, separator);
            const value = pair.slice(separator + 1);
            if (value) cookies.set(name, value);
            else cookies.delete(name);
          }
          assert.ok(
            response.status < 500,
            'Local application returned a server error'
          );
          return response;
        },
      };
    }
    const jsonPost = (body: unknown, includeOrigin = true): RequestInit => ({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(includeOrigin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    });
    async function login(selectedPassword: string) {
      const actor = browser();
      const csrf = await actor.request('/api/auth/csrf');
      assert.equal(
        csrf.status,
        200,
        'Credentials CSRF token request must succeed'
      );
      const csrfValue = await csrf.json();
      assert.ok(
        typeof csrfValue.csrfToken === 'string' &&
          csrfValue.csrfToken.length > 0,
        'Credentials CSRF token is missing'
      );
      const result = await actor.request('/api/auth/callback/credentials', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
          Origin: origin,
          Referer: `${origin}/en/auth/login`,
        },
        body: new URLSearchParams({
          csrfToken: csrfValue.csrfToken,
          email,
          password: selectedPassword,
          callbackUrl: `${origin}/en`,
        }),
      });
      assert.equal(result.status, 200, 'Credentials callback must succeed');
      const destination = new URL((await result.json()).url);
      assert.ok(
        destination.origin === origin && !destination.searchParams.has('error'),
        'Credentials callback must return a local success destination'
      );
      const session = await actor.request('/api/auth/session');
      assert.equal(session.status, 200);
      const value = await session.json();
      assert.ok(
        value?.user?.id === id && value.user.role === 'BUYER',
        'Real credentials login must authenticate only the synthetic buyer'
      );
      return actor;
    }
    async function rejectFrozenCookie(cookie: string) {
      assert.ok(
        cookie.includes('authjs.session-token='),
        'A real signed session cookie must have been captured'
      );
      const replay = browser();
      for (let attempt = 0; attempt < 2; attempt++) {
        // Deliberately ignore refreshed/deleted cookies: replay the identical
        // captured cookie to detect the former second-request resurrection.
        const response = await replay.request('/api/auth/session', {}, cookie);
        assert.equal(response.status, 200);
        const value = await response.json();
        assert.ok(
          value === null || !value.user,
          'A revoked captured cookie must remain anonymous'
        );
      }
    }

    phase = 'credentials login before reset';
    const beforeReset = await login(originalPassword);
    const beforeResetCookie = beforeReset.cookieHeader();
    phase = 'HTTP password reset and replay';
    const token = await issuePasswordReset(database, id, 0, Date.now());
    assert.ok(token, 'A synthetic reset link must be issued');
    const anonymous = browser();
    const resetBody = {
      token,
      password: resetPassword,
      confirmPassword: resetPassword,
    };
    assert.equal(
      (
        await anonymous.request(
          '/api/auth/reset-password',
          jsonPost(resetBody, false)
        )
      ).status,
      403,
      'Real reset handler must enforce Origin/CSRF'
    );
    assert.equal(
      (await anonymous.request('/api/auth/reset-password', jsonPost(resetBody)))
        .status,
      200
    );
    assert.equal(
      (await anonymous.request('/api/auth/reset-password', jsonPost(resetBody)))
        .status,
      400,
      'Reset link must be single use over HTTP'
    );
    phase = 'old session rejection after reset';
    await rejectFrozenCookie(beforeResetCookie);
    phase = 'credentials login after reset';
    const afterReset = await login(resetPassword);
    const beforeChangeCookie = afterReset.cookieHeader();

    const snapshot = await database.user.findUniqueOrThrow({
      where: { id },
      select: { passwordChangedAt: true },
    });
    const obsoleteLink = await issuePasswordReset(
      database,
      id,
      snapshot.passwordChangedAt!.getTime(),
      Date.now()
    );
    assert.ok(obsoleteLink, 'A new synthetic reset link must be issued');
    phase = 'real authenticated password change';
    const changeBody = {
      currentPassword: resetPassword,
      newPassword: changedPassword,
      confirmPassword: changedPassword,
    };
    assert.equal(
      (
        await afterReset.request(
          '/api/account/password',
          jsonPost(changeBody, false)
        )
      ).status,
      403,
      'Real password change must enforce Origin/CSRF'
    );
    const changed = await afterReset.request(
      '/api/account/password',
      jsonPost(changeBody)
    );
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).requiresReauth, true);
    phase = 'link and session rejection after password change';
    assert.equal(
      (
        await anonymous.request(
          '/api/auth/reset-password',
          jsonPost({
            token: obsoleteLink,
            password: originalPassword,
            confirmPassword: originalPassword,
          })
        )
      ).status,
      400,
      'Password change must invalidate outstanding reset links'
    );
    await rejectFrozenCookie(beforeChangeCookie);
    phase = 'credentials login after password change';
    await login(changedPassword);
  } finally {
    phase = `${phase} / synthetic fixture cleanup`;
    try {
      if (fixtureCreated) {
        await database.passwordResetToken.deleteMany({ where: { userId: id } });
        await database.auditLog.deleteMany({ where: { userId: id } });
        await database.user.deleteMany({ where: { id, email } });
      }
      if (ownedRateIdentifiers.length)
        await database.rateLimit.deleteMany({
          where: { identifier: { in: ownedRateIdentifiers } },
        });
    } finally {
      await database.$disconnect();
    }
  }
  console.log(
    '✓ Real HTTP reset/change revoke captured sessions, reject reset replay and invalidate older links; new credentials work; fixtures cleaned'
  );
}

run().catch(() => {
  // Never log raw errors, response bodies, cookies, passwords or bearer tokens.
  console.error(`Password-security HTTP regression failed during ${phase}`);
  process.exitCode = 1;
});
