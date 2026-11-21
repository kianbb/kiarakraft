import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import '../scripts/dev/guard-test.mjs';
import {
  checkLoginRateLimit,
  getLockoutTimeRemaining,
  isAccountLocked,
  recordLoginAttempt,
} from '../lib/auth-security';
import { prisma } from '../lib/prisma';

const identifiers: string[] = [];

function fixture() {
  const uid = randomUUID();
  const email = `rate-window-${uid}@example.invalid`;
  const ip = `synthetic-test-${uid}`;
  const ipCounter = `ip_attempts:${ip}`;
  const emailCounter = `login_attempts:${email}`;
  const accountLock = `account_lock:${email}`;
  identifiers.push(ipCounter, emailCounter, accountLock);
  return { email, ip, ipCounter, emailCounter, accountLock };
}

function read(identifier: string) {
  return prisma.rateLimit.findUniqueOrThrow({ where: { identifier } });
}

async function run() {
  const past = new Date(Date.now() - 60_000);
  const account = fixture();
  try {
    await prisma.rateLimit.createMany({
      data: [
        { identifier: account.ipCounter, count: 11, resetTime: past },
        { identifier: account.emailCounter, count: 5, resetTime: past },
        { identifier: account.accountLock, count: 5, resetTime: past },
      ],
    });
    assert.deepEqual(await checkLoginRateLimit(account.email, account.ip), {
      allowed: true,
    });
    assert.equal(await isAccountLocked(account.email), false);
    assert.equal(await getLockoutTimeRemaining(account.email), 0);

    // Competing writes to the same expired rows must start a single new
    // window and count the successful updates exactly once.
    await Promise.all(
      Array.from({ length: 3 }, () =>
        recordLoginAttempt(account.email, account.ip, false)
      )
    );
    const ipWindow = await read(account.ipCounter);
    const emailWindow = await read(account.emailCounter);
    assert.equal(ipWindow.count, 3);
    assert.equal(emailWindow.count, 3);
    assert.ok(ipWindow.resetTime > new Date());
    assert.ok(emailWindow.resetTime > new Date());

    await recordLoginAttempt(account.email, account.ip, false);
    assert.deepEqual(await checkLoginRateLimit(account.email, account.ip), {
      allowed: true,
    });
    await recordLoginAttempt(account.email, account.ip, false);
    assert.equal((await read(account.emailCounter)).count, 5);
    const lock = await read(account.accountLock);
    const blocked = await checkLoginRateLimit(account.email, account.ip);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'account_locked');
    assert.ok(blocked.retryAfter! > 60 && blocked.retryAfter! <= 900);

    // An already admitted request can finish while another has locked the
    // account. Recording it must preserve both existing deadlines.
    await recordLoginAttempt(account.email, account.ip, false);
    assert.equal((await read(account.emailCounter)).count, 5);
    assert.deepEqual(
      (await read(account.ipCounter)).resetTime,
      ipWindow.resetTime
    );
    assert.deepEqual(
      (await read(account.emailCounter)).resetTime,
      emailWindow.resetTime
    );
    assert.deepEqual(
      (await read(account.accountLock)).resetTime,
      lock.resetTime
    );

    // A successful request admitted earlier can also finish after the lock
    // commits. Its cleanup must preserve the account's active lock.
    await recordLoginAttempt(account.email, account.ip, true);
    assert.deepEqual(
      (await read(account.accountLock)).resetTime,
      lock.resetTime
    );
    assert.equal(
      (await checkLoginRateLimit(account.email, account.ip)).reason,
      'account_locked'
    );

    await prisma.rateLimit.update({
      where: { identifier: account.accountLock },
      data: { resetTime: past },
    });
    await prisma.rateLimit.create({
      data: { identifier: account.emailCounter, count: 5, resetTime: past },
    });
    assert.deepEqual(await checkLoginRateLimit(account.email, account.ip), {
      allowed: true,
    });
    await recordLoginAttempt(account.email, account.ip, true);
    assert.equal(
      await prisma.rateLimit.count({
        where: {
          identifier: { in: [account.accountLock, account.emailCounter] },
        },
      }),
      0
    );

    // A live IP window still denies attempts and reports its real deadline.
    const ipOnly = fixture();
    const soon = new Date(Date.now() + 35_000);
    await prisma.rateLimit.create({
      data: { identifier: ipOnly.ipCounter, count: 9, resetTime: soon },
    });
    assert.deepEqual(await checkLoginRateLimit(ipOnly.email, ipOnly.ip), {
      allowed: true,
    });
    await recordLoginAttempt(ipOnly.email, ipOnly.ip, true);
    const ipDenied = await checkLoginRateLimit(ipOnly.email, ipOnly.ip);
    assert.equal(ipDenied.allowed, false);
    assert.equal(ipDenied.reason, 'ip_blocked');
    assert.ok(ipDenied.retryAfter! > 0 && ipDenied.retryAfter! <= 35);
    assert.deepEqual((await read(ipOnly.ipCounter)).resetTime, soon);

    // A live email window without a separate lock still enforces its cap.
    const emailOnly = fixture();
    await prisma.rateLimit.create({
      data: { identifier: emailOnly.emailCounter, count: 5, resetTime: soon },
    });
    const emailDenied = await checkLoginRateLimit(
      emailOnly.email,
      emailOnly.ip
    );
    assert.equal(emailDenied.allowed, false);
    assert.equal(emailDenied.reason, 'too_many_attempts');
    assert.ok(emailDenied.retryAfter! > 0 && emailDenied.retryAfter! <= 35);

    console.log(
      '✓ PostgreSQL login-window expiry, concurrent rollover, active limits, and account-lock deadlines passed'
    );
  } finally {
    try {
      await prisma.rateLimit.deleteMany({
        where: { identifier: { in: identifiers } },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
}

run().catch((error: unknown) => {
  const line =
    error instanceof Error
      ? /auth-rate-window\.integration\.test\.ts:(\d+):/.exec(
          error.stack ?? ''
        )?.[1]
      : undefined;
  console.error(
    'Login-rate window integration failed (synthetic fixtures only)' +
      (line ? ' at line ' + line : '')
  );
  process.exitCode = 1;
});
