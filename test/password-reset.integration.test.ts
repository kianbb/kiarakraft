import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import '../scripts/dev/guard-test.mjs';
import { prisma } from '../lib/prisma';
import {
  consumePasswordReset,
  issuePasswordReset,
  passwordResetDigest,
  validatePasswordReset,
  changePasswordWithSnapshot,
} from '../lib/password-reset';

type ResetDatabase = Parameters<typeof issuePasswordReset>[0];
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

async function run() {
  const userIds: string[] = [];
  async function user() {
    const row = await prisma.user.create({
      data: {
        email: `reset-integration-${randomUUID()}@example.invalid`,
        password: 'synthetic-old-hash',
        role: 'BUYER',
      },
    });
    userIds.push(row.id);
    return row;
  }
  try {
    const account = await user();
    const bearer = await issuePasswordReset(prisma, account.id, 0, Date.now());
    assert.ok(bearer);
    const persisted = await prisma.passwordResetToken.findMany({
      where: { userId: account.id },
    });
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].token, passwordResetDigest(bearer));
    assert.notEqual(persisted[0].token, bearer);

    // Force both requests to find the same row before either can claim it.
    const bothRead = signal();
    let reads = 0;
    const concurrent = {
      passwordResetToken: {
        async findUnique(args: Prisma.PasswordResetTokenFindUniqueArgs) {
          const row = await prisma.passwordResetToken.findUnique(args);
          if (++reads === 2) bothRead.resolve();
          await bothRead.promise;
          return row;
        },
      },
      $transaction: prisma.$transaction.bind(prisma),
    } as unknown as ResetDatabase;
    const claimed = await Promise.all([
      consumePasswordReset(concurrent, bearer, 'synthetic-new-a'),
      consumePasswordReset(concurrent, bearer, 'synthetic-new-b'),
    ]);
    assert.equal(
      claimed.filter(Boolean).length,
      1,
      'Exactly one concurrent request may claim a reset token'
    );
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: account.id },
    });
    assert.equal(
      updated.password,
      claimed[0] ? 'synthetic-new-a' : 'synthetic-new-b'
    );
    assert.ok(updated.passwordChangedAt);
    assert.equal(await validatePasswordReset(prisma, bearer), null);
    assert.equal(
      await consumePasswordReset(prisma, bearer, 'synthetic-replay'),
      false
    );

    // Two independent active links must not both succeed, even concurrently.
    const multiple = await user();
    const first = await issuePasswordReset(prisma, multiple.id, 0, Date.now());
    assert.ok(first);
    const second = `v1.0.${randomBytes(32).toString('base64url')}`;
    await prisma.passwordResetToken.create({
      data: {
        userId: multiple.id,
        token: passwordResetDigest(second)!,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const alternateClaims = await Promise.all([
      consumePasswordReset(prisma, first, 'synthetic-alternative-a'),
      consumePasswordReset(prisma, second, 'synthetic-alternative-b'),
    ]);
    assert.equal(alternateClaims.filter(Boolean).length, 1);
    const remaining = await prisma.passwordResetToken.findMany({
      where: { userId: multiple.id },
    });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].used, true);
    assert.equal(await validatePasswordReset(prisma, first), null);
    assert.equal(await validatePasswordReset(prisma, second), null);

    // Hold a real redemption transaction after its token claim. An issuance
    // request carrying the old snapshot queues behind that account lock.
    const racing = await user();
    const recovery = await issuePasswordReset(prisma, racing.id, 0, Date.now());
    assert.ok(recovery);
    const claimedSignal = signal();
    const releaseRecovery = signal();
    const issuingSignal = signal();
    const pausedRecovery = {
      passwordResetToken: prisma.passwordResetToken,
      $transaction: (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>
      ) =>
        prisma.$transaction(
          async tx => {
            const proxy = new Proxy(tx, {
              get(target, key) {
                if (key === 'user')
                  return {
                    update: async (args: Prisma.UserUpdateArgs) => {
                      claimedSignal.resolve();
                      await releaseRecovery.promise;
                      return tx.user.update(args);
                    },
                  };
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
            return callback(proxy);
          },
          { timeout: 10_000 }
        ),
    } as unknown as ResetDatabase;
    const queuedDatabase = (started: ReturnType<typeof signal>) =>
      ({
        passwordResetToken: prisma.passwordResetToken,
        $transaction: (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>
        ) =>
          prisma.$transaction(
            async tx => {
              const proxy = new Proxy(tx, {
                get(target, key) {
                  if (key === '$queryRaw')
                    return async (
                      strings: TemplateStringsArray,
                      ...values: unknown[]
                    ) => {
                      started.resolve();
                      return tx.$queryRaw(strings, ...values);
                    };
                  const value = Reflect.get(target, key);
                  return typeof value === 'function'
                    ? value.bind(target)
                    : value;
                },
              });
              return callback(proxy);
            },
            { timeout: 10_000 }
          ),
      }) as unknown as ResetDatabase;
    const recover = consumePasswordReset(
      pausedRecovery,
      recovery,
      'synthetic-recovered-hash'
    );
    await claimedSignal.promise;
    const issue = issuePasswordReset(
      queuedDatabase(issuingSignal),
      racing.id,
      0,
      Date.now()
    );
    const changingSignal = signal();
    const change = changePasswordWithSnapshot(
      queuedDatabase(changingSignal),
      racing,
      'synthetic-stale-overwrite',
      { fixture: 'reset-versus-change' }
    );
    await issuingSignal.promise;
    await changingSignal.promise;
    releaseRecovery.resolve();
    assert.equal(await recover, true);
    assert.equal(
      await change,
      false,
      'An account change that verified the old password must not overwrite recovery'
    );
    assert.equal(
      await issue,
      null,
      'An issuance overtaken by recovery must not create a surviving link'
    );
    const recovered = await prisma.user.findUniqueOrThrow({
      where: { id: racing.id },
    });
    const recoveredVersion = recovered.passwordChangedAt!.getTime();
    assert.equal(
      await issuePasswordReset(
        prisma,
        racing.id,
        recoveredVersion,
        recoveredVersion - 1
      ),
      null,
      'A request that started before recovery cannot issue even if its lookup read the new version'
    );
    assert.equal(
      await prisma.passwordResetToken.count({
        where: { userId: racing.id, used: false },
      }),
      0
    );

    const changing = await user();
    const beforeChange = await issuePasswordReset(
      prisma,
      changing.id,
      0,
      Date.now()
    );
    assert.ok(beforeChange);
    assert.equal(
      await changePasswordWithSnapshot(
        prisma,
        changing,
        'synthetic-current-change',
        { fixture: 'valid-change' }
      ),
      true
    );
    assert.equal(await validatePasswordReset(prisma, beforeChange), null);
    assert.equal(
      await consumePasswordReset(prisma, beforeChange, 'synthetic-stale-link'),
      false
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { userId: changing.id, action: 'password_changed' },
      }),
      1
    );

    // Existing plaintext links are deliberately rejected; no migration or
    // hosted deletion is implied by this local synthetic fixture.
    const legacy = randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: racing.id,
        token: legacy,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    assert.equal(await validatePasswordReset(prisma, legacy), null);
    assert.equal(
      await consumePasswordReset(prisma, legacy, 'synthetic-legacy'),
      false
    );

    // Clock jitter must never restore a previous credential/session version.
    const futureVersion = Date.now() + 60_000;
    await prisma.user.update({
      where: { id: racing.id },
      data: { passwordChangedAt: new Date(futureVersion) },
    });
    const jitterBearer = await issuePasswordReset(
      prisma,
      racing.id,
      futureVersion,
      futureVersion + 1
    );
    assert.ok(jitterBearer);
    assert.equal(
      await consumePasswordReset(prisma, jitterBearer, 'synthetic-monotonic'),
      true
    );
    assert.equal(
      (
        await prisma.user.findUniqueOrThrow({ where: { id: racing.id } })
      ).passwordChangedAt!.getTime(),
      futureVersion + 1
    );
    console.log(
      '✓ PostgreSQL reset digests, simultaneous claims, other-link invalidation, issuance race, legacy rejection and monotonic sessions'
    );
  } finally {
    if (userIds.length)
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    if (userIds.length)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

run().catch(() => {
  console.error('Password reset integration failed (synthetic fixtures only)');
  process.exitCode = 1;
});
