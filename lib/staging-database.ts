import pg from 'pg';
import type { PrismaClient } from '@prisma/client';
import {
  assertDeploymentPolicy,
  DeploymentPolicyError,
  type DeploymentEnvironment,
  type StagingPolicy,
} from './deployment-policy';
import {
  postgresConnectionOptions,
  runtimeDatabaseOptions,
} from './postgres-connection';

export type StagingQueryable = {
  query(sql: string): Promise<{ rows: unknown[] }>;
};

export const STAGING_IDENTITY_SQL = `SELECT current_database()::text AS "databaseName", current_user::text AS "roleName", mode, purpose, "deploymentId" FROM kk_staging_guard.identity LIMIT 2`;

/** Never creates/repairs a marker; provisioning is a separate explicit action. */
export async function verifyStagingDatabaseIdentity(
  client: StagingQueryable,
  policy: StagingPolicy,
  target = policy.databaseUrl
): Promise<void> {
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await client.query(STAGING_IDENTITY_SQL);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (
      result.rows.length !== 1 ||
      !row ||
      row.databaseName !== policy.databaseName ||
      row.roleName !== decodeURIComponent(target.username) ||
      row.mode !== 'staging' ||
      row.purpose !== 'synthetic-only-v1' ||
      row.deploymentId !== policy.deploymentId
    )
      throw new Error();
    await client.query('ROLLBACK');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    throw new DeploymentPolicyError(
      'Staging database identity could not be verified'
    );
  }
}

/** Explicit fields prevent PG* variables, URL options or dotenv fallbacks. */
export function stagingConnectionOptions(
  url: URL,
  policy: StagingPolicy
): pg.ClientConfig {
  if (
    url.href !== policy.databaseUrl.href &&
    url.href !== policy.directUrl.href
  ) {
    throw new DeploymentPolicyError('Staging database target is not pinned');
  }
  return {
    ...postgresConnectionOptions(url, {
      tls: true,
      applicationName: 'kiarakraft-staging-identity',
    }),
    // Preserve the server bound transaction-locally in the identity check.
    statement_timeout: 0,
    query_timeout: 5000,
  };
}

/** Build checks runtime+direct targets; runtime only needs its own target. */
export async function verifyStagingDatabaseTargets(
  env: DeploymentEnvironment = process.env,
  includeDirect = true
): Promise<void> {
  const policy = assertDeploymentPolicy(env);
  if (policy.mode !== 'staging') return;
  runtimeDatabaseOptions(env, policy);
  const targets =
    includeDirect && policy.directUrl.href !== policy.databaseUrl.href
      ? [policy.databaseUrl, policy.directUrl]
      : [policy.databaseUrl];
  for (const target of targets) {
    const client = new pg.Client(stagingConnectionOptions(target, policy));
    try {
      await client.connect();
      await verifyStagingDatabaseIdentity(client, policy, target);
    } catch {
      throw new DeploymentPolicyError(
        'Staging database identity could not be verified'
      );
    } finally {
      await client.end().catch(() => {});
    }
  }
}

/** Preserve PrismaPromises while guarding models, raw SQL and transaction start. */
export function guardPrismaDatabase(
  client: PrismaClient,
  verify: () => Promise<void>
): PrismaClient {
  let verification: Promise<void> | undefined;
  const ready = () => (verification ??= Promise.resolve().then(verify));
  const guarded = client.$extends({
    name: 'database-identity',
    query: {
      async $allOperations({ args, query }) {
        await ready();
        return query(args);
      },
    },
  });
  return new Proxy(guarded, {
    get(target, property, receiver) {
      if (property === '$transaction' || property === '$connect') {
        return async (...args: unknown[]) => {
          await ready();
          const method = Reflect.get(target, property);
          return Reflect.apply(method, target, args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as PrismaClient;
}
