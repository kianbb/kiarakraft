import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as identity from '../lib/identity-fingerprint';
import * as input from '../lib/seller-onboarding-input';
import * as jsonInput from '../lib/json-input';
import { loadRoute } from './helpers/load-route';

// Synthetic vectors, never provider keys or personal identifiers.
const nationalId = '0123456789';
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const env = {
  IDENTITY_HASH_KEY: key.toString('base64url'),
  IDENTITY_HASH_KEY_ID: 'synthetic-v1',
  NEXTAUTH_SECRET: 'test-auth-secret-before',
};
const fingerprint = identity.fingerprintNationalId(nationalId, env);
assert.equal(
  fingerprint,
  `hmac-sha256:v1:synthetic-v1:${createHmac('sha256', key)
    .update('kiarakraft:national-id:v1\0' + nationalId)
    .digest('hex')}`
);
assert.equal(identity.identityFingerprintFormat(fingerprint), 'hmac-sha256-v1');
assert.equal(
  identity.identityFingerprintFormat('a'.repeat(64)),
  'legacy-sha256-auth-v0'
);
assert.equal(
  identity.identityFingerprintFormat('unknown-preserved-value'),
  'unknown'
);
assert.equal(
  identity.fingerprintNationalId(nationalId, {
    ...env,
    NEXTAUTH_SECRET: 'test-auth-secret-after',
  }),
  fingerprint
);
assert.equal(identity.fingerprintNationalId('۰۱۲۳۴۵۶۷۸۹', env), fingerprint);
assert.equal(identity.fingerprintNationalId('٠١٢٣٤٥٦٧٨٩', env), fingerprint);
assert.notEqual(
  identity.fingerprintNationalId(nationalId, {
    ...env,
    IDENTITY_HASH_KEY: Buffer.alloc(32, 9).toString('base64url'),
  }),
  fingerprint
);
for (const settings of [
  {},
  { ...env, IDENTITY_HASH_KEY: undefined },
  { ...env, IDENTITY_HASH_KEY_ID: '' },
  { ...env, IDENTITY_HASH_KEY_ID: 'bad:key' },
  { ...env, IDENTITY_HASH_KEY: key.toString('base64') },
  { ...env, IDENTITY_HASH_KEY: Buffer.alloc(31).toString('base64url') },
  { ...env, IDENTITY_HASH_KEY: env.IDENTITY_HASH_KEY.slice(0, -1) + '9' },
  { ...env, NEXTAUTH_SECRET: env.IDENTITY_HASH_KEY },
  { ...env, AUTH_SECRET: env.IDENTITY_HASH_KEY },
])
  assert.throws(
    () => identity.fingerprintNationalId(nationalId, settings),
    identity.IdentityKeyError
  );

type Reply = { status: number; data: Record<string, unknown> };
type Handler = (request: Request) => Promise<Reply>;
const valid = {
  shopName: 'Synthetic shop',
  displayName: 'Synthetic seller',
  bio: 'A synthetic description for a handmade shop.',
  website: '',
  phone: '09120000000',
  province: 'Synthetic province',
  city: 'Synthetic city',
  address: 'Synthetic address for isolated tests',
  nationalId,
};
function harness(
  options: {
    existing?: string;
    noSession?: boolean;
    role?: string;
    stage?: boolean;
    missingKey?: boolean;
    failure?: boolean;
  } = {}
) {
  const logs: string[] = [];
  const state = {
    hash: options.existing ?? (null as string | null),
    writes: [] as Record<string, unknown>[],
    reads: 0,
    fingerprints: 0,
  };
  const logger = {
    ...console,
    log: (...args: unknown[]) => logs.push(JSON.stringify(args)),
    error: (...args: unknown[]) => logs.push(JSON.stringify(args)),
  } as Console;
  const route = loadRoute<{ POST: Handler }>(
    'app/api/seller/onboarding/complete/route.ts',
    {
      'next/server': {
        NextResponse: {
          json: (
            data: Record<string, unknown>,
            options?: { status: number }
          ) => ({ data, status: options?.status ?? 200 }),
        },
      },
      '@/lib/auth': {
        auth: async () =>
          options.noSession
            ? null
            : { user: { email: 'synthetic@example.invalid' } },
      },
      '@/lib/prisma': {
        prisma: {
          user: {
            findUnique: async () => {
              state.reads++;
              return {
                id: 'owned-user',
                role: options.role ?? 'SELLER',
                sellerProfile: {
                  id: 'owned-profile',
                  nationalIdHash: state.hash,
                },
              };
            },
          },
          sellerProfile: {
            updateMany: async ({
              where,
              data,
            }: {
              where: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              assert.equal(where.id, 'owned-profile');
              assert.equal(where.userId, 'owned-user');
              assert.equal(where.nationalIdHash, null);
              if (options.failure)
                throw new Error(
                  `synthetic database error containing ${nationalId} ${fingerprint}`
                );
              if (state.hash !== null) return { count: 0 };
              state.hash = String(data.nationalIdHash);
              state.writes.push(data);
              return { count: 1 };
            },
          },
        },
      },
      '@/lib/csrf': { withCSRF: (handler: Handler) => handler },
      '@/lib/rateLimit': {
        authRateLimit: {},
        withRateLimit: (_: unknown, handler: Handler) => handler,
      },
      '@/lib/deployment-policy': { isStagingDeployment: () => !!options.stage },
      '@/lib/identity-fingerprint': {
        ...identity,
        fingerprintNationalId: (value: string) => {
          state.fingerprints++;
          return identity.fingerprintNationalId(
            value,
            options.missingKey ? {} : env
          );
        },
      },
      '@/lib/json-input': jsonInput,
      '@/lib/seller-onboarding-input': input,
      '@/lib/seller-document-store': { ownedReadyDocuments: async () => [] },
      '@/lib/seller-documents': { SellerDocumentError: class extends Error {} },
    },
    { console: logger }
  );
  const submit = (body: unknown = valid) =>
    route.POST(
      new Request('http://127.0.0.1/api/seller/onboarding/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  return { state, logs, submit, route };
}

async function main() {
  for (const existing of [
    'a'.repeat(64),
    fingerprint,
    'unknown-preserved-value',
    '',
  ]) {
    const h = harness({ existing });
    const response = await h.submit();
    assert.equal(response.status, 409);
    assert.equal(h.state.hash, existing);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.fingerprints, 0);
  }
  for (const bad of [
    null,
    1234567890,
    {},
    '',
    '1234',
    '1'.repeat(33),
    'a'.repeat(10),
  ]) {
    const h = harness();
    const reply = await h.submit({ ...valid, nationalId: bad });
    assert.equal(reply.status, 400);
    assert.equal(h.state.writes.length, 0);
  }
  for (const doc of [
    null,
    false,
    0,
    '',
    'https://res.cloudinary.com/cloud/image/upload/kiarakraft/sellers/another/documents/id.pdf',
  ]) {
    const h = harness();
    assert.equal(
      (await h.submit({ ...valid, uploadedDocs: [doc] })).status,
      400
    );
    assert.equal(h.state.writes.length, 0);
  }
  const injected = harness();
  assert.equal(
    (await injected.submit({ ...valid, sellerId: 'other-profile' })).status,
    400
  );
  assert.equal(injected.state.writes.length, 0);
  const race = harness();
  const results = await Promise.all([race.submit(), race.submit()]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(race.state.writes.length, 1);
  assert.equal(race.state.hash, fingerprint);
  assert.equal(race.state.writes[0].verified, false);
  assert.ok(!('nationalId' in race.state.writes[0]));
  for (const sensitive of [
    nationalId,
    fingerprint,
    env.IDENTITY_HASH_KEY,
    env.IDENTITY_HASH_KEY_ID,
    valid.phone,
    valid.address,
    'synthetic@example.invalid',
  ]) {
    assert.ok(!JSON.stringify(results).includes(sensitive));
    assert.ok(!JSON.stringify(race.logs).includes(sensitive));
  }
  for (const [options, status] of [
    [{ noSession: true }, 401],
    [{ role: 'BUYER' }, 403],
    [{ missingKey: true }, 503],
    [{ failure: true }, 500],
  ] as const) {
    const h = harness(options);
    const response = await h.submit();
    assert.equal(response.status, status);
    assert.equal(h.state.writes.length, 0);
    assert.ok(!JSON.stringify(h.logs).includes(nationalId));
    assert.ok(!JSON.stringify(h.logs).includes(fingerprint));
  }
  const stage = harness({ stage: true });
  const bodyDenied = new Request('http://127.0.0.1', {
    method: 'POST',
    body: 'unreadable',
  });
  assert.equal((await stage.route.POST(bodyDenied)).status, 403);
  assert.equal(stage.state.reads, 0);
  assert.equal(bodyDenied.bodyUsed, false);
  const size = harness();
  assert.equal(
    (await size.submit({ ...valid, bio: 'x'.repeat(17000) })).status,
    413
  );
  assert.equal(size.state.writes.length, 0);
  console.log(
    '✓ Identity key separation, legacy preservation, owned first-write, input and privacy regressions passed'
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
