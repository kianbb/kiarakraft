import '../scripts/dev/guard-test.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeEnvironment } from '../scripts/dev/environment.mjs';
import { connectLocal, verifyIdentity } from '../scripts/dev/database.mjs';

// Replay the actual forward migration on temporary pre-upgrade tables. These
// shadow public tables only in this guarded connection and disappear on close.
const env = safeEnvironment({ kind: 'test', nodeEnv: 'test' });
const client = await connectLocal(env.DATABASE_URL, 'test');
try {
  await verifyIdentity(client, 'test');
  await client.query('CREATE TEMP TABLE "User" (id TEXT PRIMARY KEY)');
  await client.query(`CREATE TEMP TABLE "AIUsage" (
    id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    service TEXT NOT NULL, cost DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const persistence = await client.query(
    `SELECT relpersistence FROM pg_class WHERE oid='"AIUsage"'::regclass`
  );
  assert.equal(
    persistence.rows[0].relpersistence,
    't',
    'Migration test must only alter a temporary fixture table'
  );
  await client.query('INSERT INTO "User" (id) VALUES ($1)', [
    'synthetic-legacy-actor',
  ]);
  await client.query(
    'INSERT INTO "AIUsage" (id,"userId",service,cost,timestamp) VALUES ($1,$2,$3,$4,$5)',
    [
      'synthetic-legacy-usage',
      'synthetic-legacy-actor',
      'GPT5_MINI',
      0.0123,
      '2025-09-12 10:20:30.456',
    ]
  );
  const before = (await client.query('SELECT * FROM "AIUsage"')).rows[0];
  const sql = readFileSync(
    new URL(
      '../prisma/migrations/20261105010000_ai_usage_actors/migration.sql',
      import.meta.url
    ),
    'utf8'
  );
  await client.query(sql);
  const after = (await client.query('SELECT * FROM "AIUsage"')).rows[0];
  const { actorId, ...unchanged } = after;
  assert.deepEqual(
    unchanged,
    before,
    'Historical usage must retain user, cost, service and timestamp'
  );
  assert.equal(actorId, before.userId);
  await client.query(
    'INSERT INTO "AIUsage" (id,"userId","actorId",service,cost) VALUES ($1,NULL,$2,$3,$4)',
    [
      'synthetic-service-usage',
      'service:translation',
      'reservation:translation',
      0.02,
    ]
  );
  assert.equal(
    (await client.query('SELECT COUNT(*)::int AS count FROM "User"')).rows[0]
      .count,
    1,
    'Service reservations must not create login accounts'
  );
  for (const [id, userId, actor] of [
    ['mismatched-human', 'synthetic-legacy-actor', 'another-actor'],
    ['invalid-service', null, 'unattributed'],
    ['missing-human', 'missing-user', 'missing-user'],
  ]) {
    await assert.rejects(
      client.query(
        'INSERT INTO "AIUsage" (id,"userId","actorId",service,cost) VALUES ($1,$2,$3,$4,0.01)',
        [id, userId, actor, 'synthetic']
      ),
      error => ['23514', '23503'].includes(error.code)
    );
  }
  console.log(
    '✓ AI actor migration preserves historical usage, attribution checks and human foreign keys'
  );
} finally {
  await client.end();
}
