import '../scripts/dev/guard-test.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import * as identity from '../lib/identity-fingerprint';
import * as input from '../lib/seller-onboarding-input';
import * as jsonInput from '../lib/json-input';
import { loadRoute } from './helpers/load-route';

type Reply = { status: number; data: unknown };
async function main() {
  let userId: string | undefined;
  try {
    const user = await prisma.user.create({
      data: {
        email: `identity-${randomUUID()}@example.invalid`,
        password: 'synthetic-only',
        role: 'SELLER',
        sellerProfile: {
          create: {
            handle: `identity-${randomUUID()}`,
            shopName: 'Before',
            displayName: 'Before',
            verified: true,
          },
        },
      },
      include: { sellerProfile: true },
    });
    userId = user.id;
    const profileId = user.sellerProfile!.id;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    let reads = 0;
    let synchronize = true;
    const route = loadRoute<{ POST: (request: Request) => Promise<Reply> }>(
      'app/api/seller/onboarding/complete/route.ts',
      {
        'next/server': {
          NextResponse: {
            json: (data: unknown, options?: { status: number }) => ({
              data,
              status: options?.status ?? 200,
            }),
          },
        },
        '@/lib/auth': { auth: async () => ({ user: { email: user.email } }) },
        '@/lib/prisma': {
          prisma: {
            sellerProfile: prisma.sellerProfile,
            user: {
              findUnique: async () => {
                const row = await prisma.user.findUniqueOrThrow({
                  where: { id: user.id },
                  include: { sellerProfile: true },
                });
                if (synchronize) {
                  if (++reads === 2) release();
                  await barrier;
                }
                return row;
              },
            },
          },
        },
        '@/lib/csrf': { withCSRF: (handler: unknown) => handler },
        '@/lib/rateLimit': {
          withRateLimit: (_config: unknown, handler: unknown) => handler,
        },
        '@/lib/deployment-policy': { isStagingDeployment: () => false },
        '@/lib/identity-fingerprint': {
          ...identity,
          fingerprintNationalId: (id: string) =>
            identity.fingerprintNationalId(id, {
              IDENTITY_HASH_KEY: Buffer.alloc(32, 5).toString('base64url'),
              IDENTITY_HASH_KEY_ID: 'synthetic-integration',
            }),
        },
        '@/lib/json-input': jsonInput,
        '@/lib/seller-onboarding-input': input,
      }
    );
    const submit = (shopName: string, nationalId = '0123456789') =>
      route.POST(
        new Request('http://127.0.0.1/api/seller/onboarding/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            shopName,
            displayName: shopName,
            bio: 'Synthetic handmade shop for an isolated test.',
            phone: '09120000000',
            province: 'Synthetic',
            city: 'Synthetic',
            address: 'Synthetic test address',
            nationalId,
          }),
        })
      );
    const replies = await Promise.all([
      submit('Synthetic first'),
      submit('Synthetic second', '1234567890'),
    ]);
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
    const stored = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: profileId },
    });
    const winner =
      replies[0].status === 200 ? 'Synthetic first' : 'Synthetic second';
    assert.equal(stored.shopName, winner);
    assert.equal(stored.displayName, winner);
    assert.equal(stored.verified, false);
    assert.equal(
      identity.identityFingerprintFormat(stored.nationalIdHash!),
      'hmac-sha256-v1'
    );
    synchronize = false;
    for (const previous of [
      stored.nationalIdHash!,
      'a'.repeat(64),
      'unknown-legacy-value',
      '',
    ]) {
      await prisma.sellerProfile.update({
        where: { id: profileId },
        data: { nationalIdHash: previous, verified: true },
      });
      const before = await prisma.sellerProfile.findUniqueOrThrow({
        where: { id: profileId },
      });
      assert.equal((await submit('Replacement denied')).status, 409);
      assert.deepEqual(
        await prisma.sellerProfile.findUniqueOrThrow({
          where: { id: profileId },
        }),
        before
      );
    }
    console.log(
      '✓ Actual onboarding route preserves recorded identity/profile state and PostgreSQL first-write contention'
    );
  } finally {
    if (userId) {
      await prisma.sellerProfile.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
