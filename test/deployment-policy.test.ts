import assert from 'node:assert/strict';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  assertDeploymentPolicy,
  assertProviderAllowed,
  isStagingDeployment,
  DeploymentPolicyError,
  type DeploymentEnvironment,
} from '../lib/deployment-policy';
import {
  guardPrismaDatabase,
  STAGING_IDENTITY_SQL,
  stagingConnectionOptions,
  verifyStagingDatabaseIdentity,
} from '../lib/staging-database';
import { runtimeDatabaseOptions } from '../lib/postgres-connection';
import {
  PRODUCTION_IDENTITY_SQL,
  verifyProductionDatabaseIdentity,
} from '../lib/production-database';

function fixture(): DeploymentEnvironment {
  const url = new URL(
    'postgresql://staging-db.example.invalid/kiara_stage?sslmode=require'
  );
  url.username = 'fixture';
  url.password = 'synthetic-fixture-only';
  return {
    VERCEL_ENV: 'preview',
    KK_DEPLOYMENT_MODE: 'staging',
    AUTH_URL: 'https://stage.example.invalid',
    NEXTAUTH_URL: 'https://stage.example.invalid',
    PUBLIC_APP_BASE: 'https://stage.example.invalid',
    NEXTAUTH_SECRET: 'test-authentication-secret-123456789!',
    DATABASE_URL: url.href,
    DIRECT_URL: url.href,
    KK_STAGING_DATABASE_HOST: url.hostname,
    KK_STAGING_DATABASE_NAME: 'kiara_stage',
    KK_STAGING_DATABASE_ID: '11111111-2222-4333-8444-555555555555',
  };
}

function productionFixture(): DeploymentEnvironment {
  const host = 'ep-synthetic-pooler.eu-central-1.aws.neon.tech';
  const database = 'kiara_production_fixture';
  const role = 'kiara_runtime_fixture';
  const url = new URL(`postgresql://${host}/${database}?sslmode=verify-full`);
  url.username = role;
  url.password = 'synthetic-fixture-only';
  return {
    VERCEL_ENV: 'production',
    KK_DEPLOYMENT_MODE: 'production',
    KK_PRODUCTION_DATABASE_HOST: host,
    KK_PRODUCTION_DATABASE_NAME: database,
    KK_PRODUCTION_DATABASE_ROLE: role,
    DATABASE_URL: url.href,
  };
}

async function run() {
  for (const env of [
    {},
    { NODE_ENV: 'production' },
    { KK_DEPLOYMENT_MODE: 'local' },
  ]) {
    assert.deepEqual(assertDeploymentPolicy(env), { mode: 'standard' });
    assertProviderAllowed('email', env);
  }
  for (const env of [
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'production', KK_DEPLOYMENT_MODE: 'production' },
    { VERCEL_ENV: 'preview', KK_DEPLOYMENT_MODE: 'production' },
    { VERCEL_ENV: 'production', KK_DEPLOYMENT_MODE: 'local' },
    { KK_DEPLOYMENT_MODE: 'typo' },
  ])
    assert.throws(() => assertDeploymentPolicy(env), DeploymentPolicyError);
  assert.equal(isStagingDeployment({ VERCEL_ENV: 'preview' }), true);
  assert.equal(
    isStagingDeployment({
      KK_DEPLOYMENT_MODE: 'staging',
      VERCEL_ENV: 'production',
    }),
    true
  );
  for (const hosted of ['preview', 'production']) {
    assert.equal(
      assertDeploymentPolicy({ ...fixture(), VERCEL_ENV: hosted }).mode,
      'staging'
    );
  }
  for (const capability of [
    'email',
    'push',
    'ai',
    'uploads',
    'identity',
    'cron',
    'payments',
    'telemetry',
  ] as const) {
    for (const env of [fixture(), { VERCEL_ENV: 'preview' }]) {
      assert.throws(
        () =>
          assertProviderAllowed(capability, {
            ...env,
            OPENAI_API_KEY: 'test-accidental-key',
            RESEND_API_KEY: 'test-accidental-key',
          }),
        DeploymentPolicyError
      );
    }
  }

  for (const changes of [
    { AUTH_URL: 'http://stage.example.invalid' },
    { AUTH_URL: 'https://stage.example.invalid/path' },
    { NEXTAUTH_URL: 'https://other.example.invalid' },
    { PUBLIC_APP_BASE: '' },
    { NEXTAUTH_SECRET: 'x'.repeat(40) },
    { NEXTAUTH_SECRET: 'abcdefghijklmnopqrstuvwxyzABCDEF' },
    { NEXTAUTH_SECRET: '1234567890'.repeat(4) },
    { AUTH_SECRET: '' },
    { KK_STAGING_DATABASE_ID: 'not-a-uuid' },
    { KK_STAGING_DATABASE_NAME: 'other_database' },
    { KK_STAGING_DATABASE_HOST: 'production-db.example.invalid' },
  ])
    assert.throws(
      () => assertDeploymentPolicy({ ...fixture(), ...changes }),
      DeploymentPolicyError
    );
  for (const query of [
    'sslmode=disable',
    'sslmode=require&host=other.example.invalid',
    'sslmode=require&sslmode=require',
    'sslmode=require&sslaccept=accept_invalid_certs',
    'sslmode=require&sslaccept=strict&sslaccept=strict',
    'sslmode=require&schema=private',
    'sslmode=require&options=-c%20search_path%3Dprivate',
    'sslmode=require&service=production',
  ]) {
    const env = fixture();
    const value = new URL(env.DATABASE_URL!);
    value.search = query;
    assert.throws(
      () => assertDeploymentPolicy({ ...env, DATABASE_URL: value.href }),
      DeploymentPolicyError
    );
  }
  const policy = assertDeploymentPolicy(fixture());
  assert.equal(policy.mode, 'staging');
  if (policy.mode !== 'staging') throw new Error('Expected staging fixture');
  assert.equal(policy.databaseUrl.searchParams.has('sslaccept'), false);
  assert.equal(policy.directUrl.searchParams.has('sslaccept'), false);
  const verifiedUrl = new URL(fixture().DATABASE_URL!);
  verifiedUrl.searchParams.set('sslmode', 'verify-full');
  const verifiedPolicy = assertDeploymentPolicy({
    ...fixture(),
    DATABASE_URL: verifiedUrl.href,
  });
  assert.equal(verifiedPolicy.mode, 'staging');
  if (verifiedPolicy.mode !== 'staging') throw new Error('Expected staging');
  assert.equal(
    verifiedPolicy.databaseUrl.searchParams.get('sslmode'),
    'verify-full'
  );
  const options = stagingConnectionOptions(policy.databaseUrl, policy);
  assert.equal(options.host, policy.databaseUrl.hostname);
  assert.equal(options.database, policy.databaseName);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.options, '-c client_encoding=UTF8');
  assert.equal(options.statement_timeout, 0);
  assert.equal(options.connectionTimeoutMillis, 5000);
  assert.equal(options.query_timeout, 5000);
  assert.equal(options.sslnegotiation, 'postgres');
  assert.equal(Object.hasOwn(options, 'connectionString'), false);
  const bounded = new URL(policy.databaseUrl);
  bounded.searchParams.set('sslaccept', 'strict');
  bounded.searchParams.set('connection_limit', '3');
  bounded.searchParams.set('pool_timeout', '4');
  bounded.searchParams.set('connect_timeout', '6');
  const boundedEnv = { ...fixture(), DATABASE_URL: bounded.href };
  const boundedPool = runtimeDatabaseOptions(
    boundedEnv,
    assertDeploymentPolicy(boundedEnv)
  ).pool;
  assert.equal(boundedPool.max, 3);
  assert.equal(boundedPool.connectionTimeoutMillis, 4000);
  assert.deepEqual(boundedPool.ssl, { rejectUnauthorized: true });
  assert.equal(Object.hasOwn(boundedPool, 'connectionString'), false);
  for (const [parameter, value] of [
    ['connection_limit', '0'],
    ['connection_limit', '101'],
    ['pool_timeout', 'NaN'],
    ['connect_timeout', '99'],
  ]) {
    const drift = new URL(bounded);
    drift.searchParams.set(parameter, value);
    const env = { ...fixture(), DATABASE_URL: drift.href };
    assert.throws(
      () => runtimeDatabaseOptions(env, assertDeploymentPolicy(env)),
      DeploymentPolicyError
    );
  }
  const localUrl = new URL('postgresql://127.0.0.1:54321/kiarakraft_test');
  localUrl.username = 'fixture';
  localUrl.password = 'synthetic-local-only';
  const localEnv = {
    KK_ISOLATED: '1',
    KK_DATABASE_KIND: 'test',
    DATABASE_URL: localUrl.href,
  };
  const local = runtimeDatabaseOptions(
    localEnv,
    assertDeploymentPolicy(localEnv)
  );
  assert.equal(local.localKind, 'test');
  assert.equal(local.pool.ssl, false);
  assert.equal(local.pool.max, 10);
  for (const changes of [
    { KK_DATABASE_KIND: 'dev' },
    { DATABASE_URL: new URL('/elsewhere', localUrl).href },
    { DATABASE_URL: fixture().DATABASE_URL },
    { DATABASE_URL: localUrl.href + '?sslmode=disable' },
    { KK_DATABASE_KIND: '' },
  ]) {
    const env = { ...localEnv, ...changes };
    assert.throws(
      () => runtimeDatabaseOptions(env, assertDeploymentPolicy(env)),
      DeploymentPolicyError
    );
  }
  const contradictory = { ...fixture(), KK_ISOLATED: '1' };
  assert.throws(
    () =>
      runtimeDatabaseOptions(
        contradictory,
        assertDeploymentPolicy(contradictory)
      ),
    DeploymentPolicyError
  );
  const hosted = productionFixture();
  const production = assertDeploymentPolicy(hosted);
  if (production.mode !== 'production') throw new Error('Expected production');
  assertProviderAllowed('email', hosted);
  const hostedPool = runtimeDatabaseOptions(hosted, production).pool;
  assert.deepEqual(hostedPool.ssl, { rejectUnauthorized: true });
  assert.equal(hostedPool.user, production.roleName);
  assert.equal(hostedPool.database, production.databaseName);
  assert.equal(hostedPool.host, hosted.KK_PRODUCTION_DATABASE_HOST);
  assert.equal(Object.hasOwn(hostedPool, 'connectionString'), false);
  for (const changes of [
    {
      KK_PRODUCTION_DATABASE_HOST: 'ep-other-pooler.eu-central-1.aws.neon.tech',
    },
    { KK_PRODUCTION_DATABASE_NAME: 'another_database' },
    { KK_PRODUCTION_DATABASE_ROLE: 'another_role' },
    { KK_PRODUCTION_DATABASE_ROLE: 'neondb_owner' },
    { DIRECT_URL: hosted.DATABASE_URL },
    { KK_ISOLATED: '1' },
  ])
    assert.throws(
      () => assertDeploymentPolicy({ ...hosted, ...changes }),
      DeploymentPolicyError
    );
  for (const update of [
    (url: URL) => url.searchParams.delete('sslmode'),
    (url: URL) => url.searchParams.set('sslaccept', 'accept_invalid_certs'),
    (url: URL) => url.searchParams.append('sslmode', 'verify-full'),
    (url: URL) => url.searchParams.set('options', '-c search_path=private'),
    (url: URL) => url.searchParams.set('schema', 'private'),
    (url: URL) => {
      url.username = 'neondb_owner';
    },
    (url: URL) => {
      url.port = '5433';
    },
  ]) {
    const url = new URL(production.databaseUrl);
    update(url);
    assert.throws(
      () => assertDeploymentPolicy({ ...hosted, DATABASE_URL: url.href }),
      error =>
        error instanceof DeploymentPolicyError &&
        !error.message.includes('synthetic-fixture-only')
    );
  }
  const nonPooled = new URL(production.databaseUrl);
  nonPooled.hostname = nonPooled.hostname.replace('-pooler.', '.');
  assert.throws(
    () =>
      assertDeploymentPolicy({
        ...hosted,
        DATABASE_URL: nonPooled.href,
        KK_PRODUCTION_DATABASE_HOST: nonPooled.hostname,
      }),
    DeploymentPolicyError
  );
  const productionIdentity = {
    databaseName: production.databaseName,
    roleName: production.roleName,
    sessionRoleName: production.roleName,
    readOnly: true,
    restrictedRole: true,
    ledgerInaccessible: true,
  };
  const productionQueries: string[] = [];
  await verifyProductionDatabaseIdentity(
    {
      query: async sql => {
        productionQueries.push(sql);
        return {
          rows: sql === PRODUCTION_IDENTITY_SQL ? [productionIdentity] : [],
        };
      },
    },
    production
  );
  assert.deepEqual(productionQueries, [
    'BEGIN READ ONLY',
    "SET LOCAL statement_timeout = '5s'",
    'SET LOCAL search_path = pg_catalog, public',
    PRODUCTION_IDENTITY_SQL,
    'ROLLBACK',
  ]);
  for (const rows of [
    [],
    [productionIdentity, productionIdentity],
    [{ ...productionIdentity, databaseName: 'elsewhere' }],
    [{ ...productionIdentity, roleName: 'owner' }],
    [{ ...productionIdentity, sessionRoleName: 'owner' }],
    [{ ...productionIdentity, readOnly: false }],
    [{ ...productionIdentity, restrictedRole: false }],
    [{ ...productionIdentity, ledgerInaccessible: false }],
    [{ ...productionIdentity, ledgerInaccessible: null }],
  ]) {
    await assert.rejects(
      verifyProductionDatabaseIdentity(
        { query: async () => ({ rows }) },
        production
      ),
      DeploymentPolicyError
    );
  }
  const failedProductionQueries: string[] = [];
  await assert.rejects(
    verifyProductionDatabaseIdentity(
      {
        query: async sql => {
          failedProductionQueries.push(sql);
          if (sql === PRODUCTION_IDENTITY_SQL)
            throw new Error('private-query-sentinel');
          return { rows: [] };
        },
      },
      production
    ),
    error =>
      error instanceof DeploymentPolicyError &&
      !error.message.includes('private-query-sentinel')
  );
  assert.equal(failedProductionQueries.at(-1), 'ROLLBACK');
  const previousPgOptions = process.env.PGOPTIONS;
  const previousReplication = process.env.PGREPLICATION;
  try {
    process.env.PGOPTIONS = '-c search_path=private -c statement_timeout=0';
    const client = new pg.Client(options) as pg.Client & {
      getStartupConf(): Record<string, unknown>;
    };
    const startup = client.getStartupConf();
    assert.equal(startup.options, '-c client_encoding=UTF8');
    assert.equal(Object.hasOwn(startup, 'statement_timeout'), false);
    assert.doesNotMatch(JSON.stringify(startup), /private|search_path/);
    process.env.PGREPLICATION = 'database';
    assert.throws(
      () => stagingConnectionOptions(policy.databaseUrl, policy),
      DeploymentPolicyError
    );
    assert.throws(
      () => runtimeDatabaseOptions(localEnv, assertDeploymentPolicy(localEnv)),
      DeploymentPolicyError
    );
  } finally {
    if (previousPgOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousPgOptions;
    if (previousReplication === undefined) delete process.env.PGREPLICATION;
    else process.env.PGREPLICATION = previousReplication;
  }
  const marker = {
    databaseName: policy.databaseName,
    roleName: 'fixture',
    mode: 'staging',
    purpose: 'synthetic-only-v1',
    deploymentId: policy.deploymentId,
  };
  const queries: string[] = [];
  await verifyStagingDatabaseIdentity(
    {
      query: async sql => {
        queries.push(sql);
        return { rows: sql === STAGING_IDENTITY_SQL ? [marker] : [] };
      },
    },
    policy
  );
  assert.deepEqual(queries, [
    'BEGIN READ ONLY',
    "SET LOCAL statement_timeout = '5s'",
    STAGING_IDENTITY_SQL,
    'ROLLBACK',
  ]);
  for (const failAt of queries) {
    const attempted: string[] = [];
    await assert.rejects(
      verifyStagingDatabaseIdentity(
        {
          query: async sql => {
            attempted.push(sql);
            if (sql === failAt) throw new Error('private-query-sentinel');
            return { rows: sql === STAGING_IDENTITY_SQL ? [marker] : [] };
          },
        },
        policy
      ),
      error =>
        error instanceof DeploymentPolicyError &&
        !error.message.includes('private-query-sentinel')
    );
    assert.equal(attempted.at(-1), 'ROLLBACK');
    if (failAt === "SET LOCAL statement_timeout = '5s'")
      assert.equal(attempted.includes(STAGING_IDENTITY_SQL), false);
  }
  for (const rows of [
    [],
    [marker, marker],
    [{ ...marker, databaseName: 'other' }],
    [{ ...marker, roleName: 'other' }],
    [{ ...marker, mode: 'production' }],
    [{ ...marker, purpose: 'other' }],
    [{ ...marker, deploymentId: 'other' }],
  ]) {
    await assert.rejects(
      verifyStagingDatabaseIdentity({ query: async () => ({ rows }) }, policy),
      DeploymentPolicyError
    );
  }
  await assert.rejects(
    verifyStagingDatabaseIdentity(
      {
        query: async () => {
          throw new Error('private-connection-sentinel');
        },
      },
      policy
    ),
    error =>
      error instanceof DeploymentPolicyError &&
      !error.message.includes('private-connection-sentinel')
  );

  // Real installed Prisma extension dispatch, denied before engine SQL/network.
  // Only a closed loopback port is configured as a second layer of isolation.
  const client = new PrismaClient({
    adapter: new PrismaPg({
      host: '127.0.0.1',
      port: 9,
      database: 'disabled',
      user: 'disabled',
      password: 'disabled',
      ssl: false,
    }),
  });
  let verifications = 0;
  const guarded = guardPrismaDatabase(client, async () => {
    verifications++;
    throw new DeploymentPolicyError('Synthetic identity denial');
  });
  try {
    const actions = [
      () => guarded.user.findMany(),
      () => guarded.$queryRaw`SELECT 1`,
      () => guarded.$executeRawUnsafe('SELECT 1'),
      () => guarded.$transaction(tx => tx.user.findMany()),
      () => guarded.$transaction([guarded.user.findMany()]),
      () => guarded.$connect(),
    ];
    for (const action of actions)
      await assert.rejects(
        Promise.resolve().then(action),
        DeploymentPolicyError
      );
    assert.equal(
      verifications,
      1,
      'Failed identity verification remains closed across all operations'
    );
  } finally {
    await client.$disconnect();
  }

  // The actual deployment entry rejects unsafe hosted environments before
  // generation/build. Read-only normal preflight must not need any database.
  for (const [env, expected] of [
    [{}, 0],
    [{ VERCEL_ENV: 'preview' }, 1],
    [{ VERCEL_ENV: 'production' }, 1],
    [{ KK_DEPLOYMENT_MODE: 'production' }, 1],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      ['scripts/staging/build.mjs', '--preflight-only'],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env },
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, expected);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /private-connection-sentinel|synthetic-fixture-only/
    );
  }
  console.log(
    '✓ Staging and production targets, role permissions and real Prisma query/transaction barriers'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
