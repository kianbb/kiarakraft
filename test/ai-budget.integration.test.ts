import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import '../scripts/dev/guard-test.mjs';
import { prisma } from '../lib/prisma';
import { AIBudgetError, createAIBudgetGuard } from '../lib/ai-budget';
import type { Prisma, PrismaClient } from '@prisma/client';

const unit = BigInt(1000); // Synthetic test reservation, never a configured production budget.
const micro = BigInt(1000000);
const usd = (value: bigint) =>
  `${value / micro}.${String(value % micro).padStart(6, '0')}`;

// Only the clock SELECT is deterministic here; the lock, aggregates and inserts
// execute against PostgreSQL. No production clock override is exposed.
function databaseClock(admittedAt: string, timezone: string) {
  return {
    $transaction: async (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: {
        isolationLevel?: Prisma.TransactionIsolationLevel;
        maxWait?: number;
        timeout?: number;
      }
    ) =>
      prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
        let locked = false;
        const wrapped = new Proxy(tx, {
          get(target, property) {
            if (property !== '$queryRaw') return Reflect.get(target, property);
            return async (...args: unknown[]) => {
              const query = args[0] as Prisma.Sql | TemplateStringsArray;
              const sql = Array.isArray(query)
                ? query.join('?')
                : (query as Prisma.Sql).sql;
              if (sql.includes('clock_timestamp')) {
                assert.ok(
                  locked,
                  'Admission clock must be read after the global lock'
                );
                assert.ok(
                  sql.includes('timestamp(3)'),
                  'Admission must match ledger timestamp precision'
                );
                return target.$queryRaw`SELECT ${admittedAt}::timestamp(3)::text AS "admittedAt"`;
              }
              const result = await Reflect.apply(
                target.$queryRaw,
                target,
                args
              );
              if (sql.includes('pg_advisory_xact_lock')) locked = true;
              return result;
            };
          },
        });
        return callback(wrapped);
      }, options),
  } as unknown as Pick<PrismaClient, '$transaction'>;
}

async function run() {
  const suffix = randomUUID();
  const actors = [`ai-budget-a-${suffix}`, `ai-budget-b-${suffix}`];
  const reservations = new Set<string>();
  const createdUsers: string[] = [];
  const serviceBaseline = await prisma.aIUsage.findMany({
    where: { actorId: 'service:translation' },
    orderBy: { id: 'asc' },
  });
  const baseline = await prisma.$queryRaw<
    Array<{ total: string; invalid: string }>
  >`
    SELECT COALESCE(SUM(CEIL(cost::numeric * 1000000)),0)::text AS total,
      COUNT(*) FILTER (WHERE NOT (cost >= 0 AND cost < 'Infinity'::float8))::text AS invalid
    FROM "AIUsage"
    WHERE timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      AND timestamp < date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '1 month'
  `;
  assert.equal(
    baseline[0].invalid,
    '0',
    'Existing test ledger is invalid; refusing to alter its rows'
  );
  const globalBaseline = BigInt(baseline[0].total);
  const config = (userLimit: bigint, globalLimit: bigint) => ({
    AI_MONTHLY_USER_BUDGET_USD: usd(userLimit),
    AI_MONTHLY_GLOBAL_BUDGET_USD: usd(globalLimit),
    AI_TEXT_REQUEST_RESERVATION_USD: usd(unit),
    AI_IMAGE_REQUEST_RESERVATION_USD: usd(unit),
    AI_TRANSLATION_REQUEST_RESERVATION_USD: usd(unit),
  });
  async function record(
    guard: ReturnType<typeof createAIBudgetGuard>,
    userId: string,
    purpose: string,
    kind: 'text' | 'translation' = 'text'
  ) {
    const result = await guard({ userId, kind, purpose });
    reservations.add(result.id);
    return result;
  }
  try {
    for (const [index, id] of actors.entries()) {
      await prisma.user.create({
        data: {
          id,
          email: `ai-budget-${index}-${suffix}@example.invalid`,
          password: 'synthetic-unusable-password',
        },
      });
      createdUsers.push(id);
    }
    const globalGuard = createAIBudgetGuard(
      prisma,
      config(unit * BigInt(10), globalBaseline + unit * BigInt(2))
    );
    let providerInvocations = 0;
    const globalResults = await Promise.allSettled(
      Array.from({ length: 8 }, async (_, index) => {
        await record(globalGuard, actors[index % 2], 'global-concurrency');
        providerInvocations++;
      })
    );
    assert.equal(
      globalResults.filter(result => result.status === 'fulfilled').length,
      2
    );
    assert.equal(
      providerInvocations,
      2,
      'Exactly two reserved calls may reach the synthetic provider'
    );
    for (const result of globalResults)
      if (result.status === 'rejected') {
        assert.ok(
          result.reason instanceof AIBudgetError &&
            result.reason.code === 'LIMIT_EXCEEDED'
        );
      }
    assert.equal(
      await prisma.aIUsage.count({ where: { actorId: { in: actors } } }),
      2,
      'Denied calls must not consume reservations'
    );

    const actorTotal = await prisma.aIUsage.aggregate({
      where: { actorId: actors[0] },
      _sum: { cost: true },
    });
    const actorMicros = BigInt(
      Math.round((actorTotal._sum.cost ?? 0) * 1000000)
    );
    const actorGuard = createAIBudgetGuard(
      prisma,
      config(actorMicros + unit, globalBaseline + unit * BigInt(100))
    );
    const actorResults = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        record(actorGuard, actors[0], 'actor-concurrency')
      )
    );
    assert.equal(
      actorResults.filter(result => result.status === 'fulfilled').length,
      1,
      'Concurrent calls must respect the per-actor cap'
    );
    assert.equal(
      await prisma.aIUsage.count({ where: { actorId: actors[0] } }),
      Number(actorMicros / unit) + 1
    );

    const generousGuard = createAIBudgetGuard(
      prisma,
      config(unit * BigInt(100), globalBaseline + unit * BigInt(100))
    );
    const beforeFailure = await prisma.aIUsage.count({
      where: { actorId: actors[1] },
    });
    await assert.rejects(async () => {
      await record(generousGuard, actors[1], 'provider-failure');
      throw new Error('Synthetic provider timeout after admission');
    }, /Synthetic provider timeout/);
    assert.equal(
      await prisma.aIUsage.count({ where: { actorId: actors[1] } }),
      beforeFailure + 1,
      'A possible billable failure must retain its full reservation'
    );

    for (const invalidCost of ['NaN', '-0.001']) {
      const id = randomUUID();
      await prisma.$executeRaw`INSERT INTO "AIUsage" (id,"userId","actorId",service,cost,timestamp) VALUES (${id},${actors[0]},${actors[0]},'synthetic-invalid-ledger',${invalidCost}::float8,CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;
      reservations.add(id);
      try {
        await assert.rejects(
          generousGuard({
            userId: actors[1],
            kind: 'text',
            purpose: 'invalid-ledger-denial',
          }),
          (error: unknown) =>
            error instanceof AIBudgetError && error.code === 'TRACKING_FAILED'
        );
      } finally {
        // deleteMany returns a count, so Prisma need not deserialize the NaN
        // cost in this deliberately malformed synthetic fixture.
        await prisma.aIUsage.deleteMany({ where: { id, actorId: actors[0] } });
        reservations.delete(id);
      }
    }
    await assert.rejects(
      generousGuard({
        userId: `missing-${suffix}`,
        kind: 'text',
        purpose: 'missing-actor',
      }),
      (error: unknown) =>
        error instanceof AIBudgetError && error.code === 'TRACKING_FAILED'
    );

    const serviceTotal = await prisma.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM(CEIL(cost::numeric * 1000000)),0)::text AS total FROM "AIUsage"
      WHERE "actorId"='service:translation'
        AND timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        AND timestamp < date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '1 month'
    `;
    const serviceGuard = createAIBudgetGuard(
      prisma,
      config(
        BigInt(serviceTotal[0].total) + unit,
        globalBaseline + unit * BigInt(100)
      )
    );
    const service = await record(
      serviceGuard,
      'service:translation',
      'service-attribution',
      'translation'
    );
    const serviceRow = await prisma.aIUsage.findUniqueOrThrow({
      where: { id: service.id },
    });
    assert.equal(serviceRow.userId, null);
    assert.equal(serviceRow.actorId, 'service:translation');

    const admittedAt = '2040-02-01 00:00:00.123';
    const futureBaseline = await prisma.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM(CEIL(cost::numeric * 1000000)),0)::text AS total
      FROM "AIUsage" WHERE timestamp >= '2040-02-01'::timestamp AND timestamp < '2040-03-01'::timestamp
    `;
    const futureTotal = BigInt(futureBaseline[0].total);
    for (const [time, cost] of [
      ['2040-01-31 23:59:59.999', 0.1],
      ['2040-02-01 00:00:00.000', 0.001],
    ] as const) {
      const id = randomUUID();
      await prisma.$executeRaw`INSERT INTO "AIUsage" (id,"userId","actorId",service,cost,timestamp) VALUES (${id},${actors[0]},${actors[0]},'synthetic-month-boundary',${cost},${time}::timestamp)`;
      reservations.add(id);
    }
    const hawaii = createAIBudgetGuard(
      databaseClock(admittedAt, 'Pacific/Honolulu'),
      config(unit * BigInt(2), futureTotal + unit * BigInt(2))
    );
    const firstNewMonth = await record(
      hawaii,
      actors[0],
      'new-month-admission'
    );
    const kiritimati = createAIBudgetGuard(
      databaseClock(admittedAt, 'Pacific/Kiritimati'),
      config(unit * BigInt(2), futureTotal + unit * BigInt(2))
    );
    await assert.rejects(
      kiritimati({
        userId: actors[0],
        kind: 'text',
        purpose: 'new-month-denial',
      }),
      (error: unknown) =>
        error instanceof AIBudgetError && error.code === 'LIMIT_EXCEEDED'
    );
    const eastTimezone = createAIBudgetGuard(
      databaseClock(admittedAt, 'Pacific/Kiritimati'),
      config(unit * BigInt(2), futureTotal + unit * BigInt(3))
    );
    const secondNewMonth = await record(
      eastTimezone,
      actors[1],
      'new-month-east-timezone'
    );
    const admittedRows = await prisma.$queryRaw<Array<{ timestamp: string }>>`
      SELECT timestamp::text AS timestamp FROM "AIUsage" WHERE id IN (${firstNewMonth.id},${secondNewMonth.id}) ORDER BY id
    `;
    assert.equal(admittedRows.length, 2);
    assert.ok(
      admittedRows.every(row => row.timestamp === admittedAt),
      'Month lookup and insert must use the same post-lock UTC timestamp in every session timezone'
    );
  } finally {
    if (reservations.size)
      await prisma.aIUsage.deleteMany({
        where: {
          id: { in: [...reservations] },
          actorId: { in: [...actors, 'service:translation'] },
        },
      });
    if (createdUsers.length) {
      await prisma.aIUsage.deleteMany({
        where: { actorId: { in: createdUsers } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    }
    const serviceAfter = await prisma.aIUsage.findMany({
      where: { actorId: 'service:translation' },
      orderBy: { id: 'asc' },
    });
    assert.ok(
      JSON.stringify(serviceAfter) === JSON.stringify(serviceBaseline),
      'Pre-existing service-actor ledger rows were not preserved'
    );
    await prisma.$disconnect();
  }
  console.log(
    '✓ PostgreSQL AI concurrency, durable failures, ledger denial, service attribution, and UTC admission boundary passed'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
