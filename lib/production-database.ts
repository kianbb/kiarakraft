import pg from 'pg';
import {
  DeploymentPolicyError,
  type ProductionPolicy,
} from './deployment-policy';
import { runtimeDatabaseOptions } from './postgres-connection';

type DatabaseQueryable = {
  query(sql: string): Promise<{ rows: unknown[] }>;
};

export const PRODUCTION_IDENTITY_SQL = `SELECT
  current_database()::text AS "databaseName",
  current_user::text AS "roleName",
  session_user::text AS "sessionRoleName",
  current_setting('transaction_read_only') = 'on' AS "readOnly",
  NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
    AND NOT EXISTS (
      SELECT FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid
    )
    AND NOT EXISTS (
      SELECT FROM pg_catalog.pg_database d
      WHERE d.datname = current_database() AND d.datdba = r.oid
    )
    AND NOT has_database_privilege(current_database(), 'CREATE')
    AND has_schema_privilege('public', 'USAGE')
    AND NOT has_schema_privilege('public', 'CREATE')
    AND NOT EXISTS (
      SELECT FROM pg_catalog.pg_namespace n
      WHERE n.nspname = 'public' AND n.nspowner = r.oid
    )
    AND NOT EXISTS (
      SELECT FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relowner = r.oid
    ) AS "restrictedRole",
  (
    SELECT NOT has_table_privilege(
        c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          || CASE WHEN current_setting('server_version_num')::int >= 170000
            THEN ',MAINTAIN' ELSE '' END
      )
      AND NOT has_any_column_privilege(c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations'
  ) AS "ledgerInaccessible"
FROM pg_catalog.pg_roles r
WHERE r.rolname = current_user`;

export async function verifyProductionDatabaseIdentity(
  client: DatabaseQueryable,
  policy: Pick<ProductionPolicy, 'databaseName' | 'roleName'>
): Promise<void> {
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query('SET LOCAL search_path = pg_catalog, public');
    const { rows } = await client.query(PRODUCTION_IDENTITY_SQL);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (
      rows.length !== 1 ||
      !row ||
      row.databaseName !== policy.databaseName ||
      row.roleName !== policy.roleName ||
      row.sessionRoleName !== policy.roleName ||
      row.readOnly !== true ||
      row.restrictedRole !== true ||
      row.ledgerInaccessible !== true
    ) {
      throw new Error();
    }
    await client.query('ROLLBACK');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    throw new DeploymentPolicyError(
      'Production database identity or role permissions could not be verified'
    );
  }
}

export async function verifyProductionDatabaseTarget(
  policy: ProductionPolicy
): Promise<void> {
  const { pool } = runtimeDatabaseOptions({}, policy);
  const client = new pg.Client({ ...pool, query_timeout: 5000 });
  try {
    await client.connect();
    await verifyProductionDatabaseIdentity(client, policy);
  } catch {
    throw new DeploymentPolicyError(
      'Production database identity or role permissions could not be verified'
    );
  } finally {
    await client.end().catch(() => {});
  }
}
