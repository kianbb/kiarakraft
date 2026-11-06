import assert from 'node:assert/strict';
import NextAuth from 'next-auth';
import { NextRequest } from 'next/server';
import { encode, decode, type JWT } from 'next-auth/jwt';
import {
  authConfig,
  createVerifiedJwtCallback,
  type VerifiedSessionUser,
} from '../lib/auth-config';

async function run() {
  // Exercise the installed Auth.js request/renewal path, without Prisma,
  // provider requests, or any application/hosted credentials.
  const secret = 'synthetic-session-regression-secret-only';
  const cookieName = 'authjs.session-token';
  const started = Date.now() - 5_000;
  let account: VerifiedSessionUser | null = {
    id: 'synthetic-user',
    email: 'synthetic@example.test',
    name: 'Synthetic account',
    role: 'ADMIN',
    image: null,
    passwordChangedAt: null,
    sellerProfile: null,
  };
  let failLookup = false;
  let lookups = 0;
  const jwt = createVerifiedJwtCallback(async id => {
    lookups++;
    assert.equal(id, 'synthetic-user');
    if (failLookup) throw new Error('Synthetic database failure');
    return account;
  });
  const initial: JWT = {
    sub: 'synthetic-user',
    role: 'ADMIN',
    authVersion: 0,
    authStartedAt: started,
  };
  const encodeToken = (token: JWT) =>
    encode({ token, secret, salt: cookieName, maxAge: 86_400 });
  async function request(token: string) {
    const { handlers } = NextAuth({
      ...authConfig,
      secret,
      trustHost: true,
      basePath: '/api/auth',
      providers: [],
      callbacks: { ...authConfig.callbacks, jwt },
      logger: {
        error: () => assert.fail('Auth.js should handle invalidation normally'),
        warn: () => {},
        debug: () => {},
      },
    });
    const response = await handlers.GET(
      new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${cookieName}=${token}` },
      })
    );
    assert.equal(response.status, 200);
    return { response, body: await response.json() };
  }
  function renewedCookie(response: Response) {
    const cookie = response.headers
      .getSetCookie()
      .find(value => value.startsWith(`${cookieName}=`));
    assert.ok(cookie, 'Auth.js must issue or clear the session cookie');
    return cookie.slice(cookieName.length + 1).split(';')[0];
  }
  async function deniedTwice(token: string) {
    for (let i = 0; i < 2; i++) {
      const { response, body } = await request(token);
      assert.equal(body, null);
      assert.equal(renewedCookie(response), '');
      assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
    }
  }

  const original = await encodeToken(initial);
  const healthy = await request(original);
  assert.equal(healthy.body.user.role, 'ADMIN');
  const renewed = renewedCookie(healthy.response);
  const renewedPayload = await decode({
    token: renewed,
    secret,
    salt: cookieName,
  });
  assert.equal(renewedPayload!.authStartedAt, started);
  assert.equal(renewedPayload!.authVersion, 0);
  assert.ok(renewedPayload!.iat! * 1000 > started);

  // Middleware uses the shared callback without database access. Its renewal
  // must preserve the version that the authoritative Node callback checks.
  const edgeToken = await authConfig.callbacks!.jwt!({
    token: renewedPayload!,
  } as Parameters<typeof jwt>[0]);
  assert.equal(edgeToken!.authVersion, 0);
  assert.equal(edgeToken!.authStartedAt, started);

  // Password invalidation must clear the JWT, including after renewal. A
  // rejected request must never mint a newly valid `iat` for the next request.
  account.passwordChangedAt = new Date();
  await deniedTwice(original);
  await deniedTwice(renewed);
  await deniedTwice(await encodeToken(edgeToken!));

  // Millisecond precision also rejects changes within the login second.
  const changedAt = Math.floor(Date.now() / 1000) * 1000 + 1;
  account.passwordChangedAt = new Date(changedAt + 1);
  await deniedTwice(await encodeToken({ ...initial, authVersion: changedAt }));

  account.passwordChangedAt = null;
  account.role = 'BUYER';
  let demoted = await request(original);
  assert.equal(demoted.body.user.role, 'BUYER');
  account.role = 'SELLER';
  const privateSeller = {
    id: 'synthetic-seller',
    shopName: 'Shop',
    displayName: 'Seller',
    nationalIdHash: 'synthetic-private-sentinel',
    docsFolder: 'synthetic-private-folder',
  };
  account.sellerProfile = privateSeller;
  const seller = await request(original);
  assert.equal(seller.body.user.role, 'SELLER');
  assert.equal(seller.body.user.sellerProfile.id, privateSeller.id);
  assert.ok(!JSON.stringify(seller.body).includes('synthetic-private'));
  account.role = 'BUYER';
  demoted = await request(renewedCookie(seller.response));
  assert.equal(demoted.body.user.role, 'BUYER');

  account = null;
  await deniedTwice(original);
  failLookup = true;
  await deniedTwice(original);
  failLookup = false;

  // Legacy/malformed/expired tokens cannot bypass validation or load accounts.
  const lookupsBefore = lookups;
  for (const token of [
    { sub: initial.sub, role: 'ADMIN' },
    {
      ...initial,
      authStartedAt: Date.now() - authConfig.session!.maxAge! * 1000 - 1,
    },
    { ...initial, authStartedAt: Date.now() + 60_000 },
    { ...initial, authVersion: '0' },
  ]) {
    await deniedTwice(await encodeToken(token as JWT));
  }
  assert.equal(lookups, lookupsBefore);

  // Client session updates cannot overwrite the credential version or role.
  account = {
    id: 'synthetic-user',
    email: 'synthetic@example.test',
    name: null,
    role: 'BUYER',
    image: null,
    passwordChangedAt: null,
    sellerProfile: null,
  };
  const updated = await jwt({
    token: { ...initial, role: 'SELLER' },
    trigger: 'update',
    session: { role: 'ADMIN', authVersion: 99, authStartedAt: Date.now() },
  } as Parameters<typeof jwt>[0]);
  assert.equal(updated!.role, 'BUYER');
  assert.equal(updated!.authVersion, 0);
  assert.equal(updated!.authStartedAt, started);

  // Login must use the version read together with the verified password;
  // changing credentials between authorize() and jwt() invalidates that login.
  const credentialSnapshot = { ...account, authVersion: 0 };
  account.passwordChangedAt = new Date();
  const signInContext = {
    token: { sub: account.id, role: account.role },
    user: credentialSnapshot,
    trigger: 'signIn',
  } as Parameters<typeof jwt>[0];
  assert.equal(await jwt(signInContext), null);
  credentialSnapshot.authVersion = account.passwordChangedAt.getTime();
  const freshLogin = await jwt(signInContext);
  assert.equal(freshLogin!.authVersion, account.passwordChangedAt.getTime());
  assert.ok((freshLogin!.authStartedAt as number) >= started);
  console.log(
    '✓ Installed Auth.js clears revoked sessions, refreshes roles, and preserves authentication claims'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
