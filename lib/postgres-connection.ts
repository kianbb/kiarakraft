import pg from 'pg';
import {
  DeploymentPolicyError,
  type DeploymentEnvironment,
  type DeploymentPolicy,
} from './deployment-policy';

type LocalDatabaseKind = 'dev' | 'test';
type RuntimeDatabase = {
  pool: pg.PoolConfig;
  localKind?: LocalDatabaseKind;
};

export function postgresConnectionOptions(
  url: URL,
  { tls, applicationName }: { tls: boolean; applicationName: string }
): pg.ClientConfig {
  // pg reads these optional settings from the live environment. In particular,
  // a replication connection does not support the application's SQL protocol.
  if (process.env.PGREPLICATION || process.env.PGBINARY) {
    throw new DeploymentPolicyError('Unsupported ambient PostgreSQL settings');
  }
  try {
    const port = Number(url.port || 5432);
    const database = decodeURIComponent(url.pathname.slice(1));
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !/^[a-z0-9.-]+$/i.test(url.hostname) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !database ||
      database.includes('/') ||
      !user ||
      !password ||
      [database, user, password].some(value => value.includes('\0')) ||
      url.hash
    ) {
      throw new Error();
    }
    return {
      host: url.hostname,
      port,
      database,
      user,
      password,
      ssl: tls ? { rejectUnauthorized: true } : false,
      sslnegotiation: 'postgres',
      // Fix the startup option without setting search_path, which transaction
      // poolers may reject as a per-session startup option.
      options: '-c client_encoding=UTF8',
      client_encoding: 'UTF8',
      application_name: applicationName,
      connectionTimeoutMillis: 5000,
    };
  } catch {
    throw new DeploymentPolicyError('Invalid PostgreSQL connection identity');
  }
}

function positiveParameter(
  url: URL,
  key: string,
  fallback: number,
  maximum: number
): number {
  const [value, ...duplicates] = url.searchParams.getAll(key);
  if (value === undefined) return fallback;
  const number = Number(value);
  if (
    duplicates.length ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > maximum
  ) {
    throw new DeploymentPolicyError('Invalid PostgreSQL pool configuration');
  }
  return number;
}

export function runtimeDatabaseOptions(
  env: DeploymentEnvironment,
  policy: DeploymentPolicy
): RuntimeDatabase {
  if (policy.mode === 'staging' && env.KK_ISOLATED === '1') {
    throw new DeploymentPolicyError(
      'Isolated runtime cannot use staging settings'
    );
  }
  let url: URL;
  try {
    url =
      policy.mode === 'staging'
        ? policy.databaseUrl
        : new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new DeploymentPolicyError(
      'An explicit PostgreSQL target is required'
    );
  }
  const local =
    policy.mode === 'standard' &&
    (env.KK_ISOLATED === '1' || env.KK_DEPLOYMENT_MODE !== 'production');
  let localKind: LocalDatabaseKind | undefined;
  if (local) {
    const kind = env.KK_DATABASE_KIND;
    if (
      (kind !== 'dev' && kind !== 'test') ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      Number(url.port) < 1024 ||
      url.pathname !== `/kiarakraft_${kind}` ||
      url.search
    ) {
      throw new DeploymentPolicyError(
        'A guarded loopback database is required locally'
      );
    }
    localKind = kind;
  } else if (
    url.searchParams.getAll('sslmode').length !== 1 ||
    !['require', 'verify-full'].includes(
      url.searchParams.get('sslmode') ?? ''
    ) ||
    url.searchParams.getAll('sslaccept').length > 1 ||
    (url.searchParams.has('sslaccept') &&
      url.searchParams.get('sslaccept') !== 'strict') ||
    url.searchParams.getAll('schema').length > 1 ||
    (url.searchParams.has('schema') &&
      url.searchParams.get('schema') !== 'public')
  ) {
    throw new DeploymentPolicyError(
      'Hosted PostgreSQL requires verified TLS and the public schema'
    );
  }
  const connection = postgresConnectionOptions(url, {
    tls: !local,
    applicationName:
      policy.mode === 'staging' ? 'kiarakraft-staging-app' : 'kiarakraft-app',
  });
  return {
    localKind,
    pool: {
      ...connection,
      // pg uses the same setting to wait for a checkout and to open a socket.
      // Honor whichever of the previously separate limits is stricter.
      connectionTimeoutMillis:
        1000 *
        Math.min(
          positiveParameter(url, 'connect_timeout', 5, 60),
          positiveParameter(url, 'pool_timeout', 10, 60)
        ),
      max: positiveParameter(url, 'connection_limit', local ? 10 : 1, 100),
      idleTimeoutMillis: 10_000,
    },
  };
}

export async function verifyLocalRuntimeIdentity(
  options: pg.ClientConfig,
  kind: LocalDatabaseKind
): Promise<void> {
  const client = new pg.Client({ ...options, query_timeout: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query<{
      name: string;
      role: string;
      purpose: string;
    }>(
      'SELECT current_database() AS name, current_user AS role, purpose FROM kk_local_guard.identity WHERE kind = $1 LIMIT 2',
      [kind]
    );
    if (
      rows.length !== 1 ||
      rows[0].name !== `kiarakraft_${kind}` ||
      rows[0].role !== options.user ||
      rows[0].purpose !== 'synthetic-only-v1'
    ) {
      throw new Error();
    }
  } catch {
    throw new DeploymentPolicyError(
      'Local database identity could not be verified'
    );
  } finally {
    await client.end().catch(() => {});
  }
}
