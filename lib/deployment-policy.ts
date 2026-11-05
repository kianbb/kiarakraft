export type DeploymentEnvironment = Record<string, string | undefined>;
export type ProviderCapability =
  | 'email'
  | 'push'
  | 'ai'
  | 'uploads'
  | 'identity'
  | 'cron'
  | 'payments'
  | 'telemetry';

export class DeploymentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentPolicyError';
  }
}

export type StagingPolicy = {
  mode: 'staging';
  origin: string;
  databaseUrl: URL;
  directUrl: URL;
  databaseName: string;
  deploymentId: string;
};
export type DeploymentPolicy = StagingPolicy | { mode: 'standard' };

// Preview is restrictive even if its explicit mode is missing/misspelled.
export function isStagingDeployment(
  env: DeploymentEnvironment = process.env
): boolean {
  return env.KK_DEPLOYMENT_MODE === 'staging' || env.VERCEL_ENV === 'preview';
}

function required(env: DeploymentEnvironment, key: string): string {
  const value = env[key];
  if (!value || value.trim() !== value)
    throw new DeploymentPolicyError(
      `Missing or invalid staging setting: ${key}`
    );
  return value;
}

function canonicalOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !url.hostname.includes('.')
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new DeploymentPolicyError(
      'Staging authentication requires one canonical HTTPS origin'
    );
  }
}

const databaseParameters = new Set([
  'sslmode',
  'sslaccept',
  'schema',
  'pgbouncer',
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'statement_cache_size',
  'application_name',
]);

function stagingDatabaseUrl(
  value: string,
  hostname: string,
  databaseName: string
): URL {
  try {
    const url = new URL(value);
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !url.username ||
      !url.password ||
      url.hostname !== hostname ||
      decodeURIComponent(url.pathname.slice(1)) !== databaseName ||
      url.hash ||
      !['require', 'verify-full'].includes(
        url.searchParams.get('sslmode') || ''
      ) ||
      (url.searchParams.has('sslaccept') &&
        url.searchParams.get('sslaccept') !== 'strict') ||
      (url.searchParams.has('schema') &&
        url.searchParams.get('schema') !== 'public')
    )
      throw new Error();
    const seen = new Set<string>();
    for (const key of url.searchParams.keys()) {
      if (!databaseParameters.has(key) || seen.has(key)) throw new Error();
      seen.add(key);
    }
    // Prisma 6 defaults sslaccept to accept_invalid_certs and documents
    // require (rather than libpq's verify-full) as its required TLS mode.
    // Keep certificate verification on for the actual ORM connection too.
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    return url;
  } catch {
    // Neither connection strings nor underlying URL parser errors may leak.
    throw new DeploymentPolicyError(
      'Staging database target or TLS settings do not match the pinned identity'
    );
  }
}

/** Synchronous validation runs before creating clients or reading any DB. */
export function assertDeploymentPolicy(
  env: DeploymentEnvironment = process.env
): DeploymentPolicy {
  if (
    ['preview', 'production'].includes(env.VERCEL_ENV || '') &&
    !['staging', 'production'].includes(env.KK_DEPLOYMENT_MODE || '')
  ) {
    throw new DeploymentPolicyError(
      'Hosted deployments require an explicit staging or production mode'
    );
  }
  if (env.VERCEL_ENV === 'preview' && env.KK_DEPLOYMENT_MODE !== 'staging') {
    throw new DeploymentPolicyError(
      'Preview requires KK_DEPLOYMENT_MODE=staging before build or database access'
    );
  }
  if (
    env.KK_DEPLOYMENT_MODE &&
    !['staging', 'production', 'local'].includes(env.KK_DEPLOYMENT_MODE)
  ) {
    throw new DeploymentPolicyError('Unknown deployment mode');
  }
  if (!isStagingDeployment(env)) return { mode: 'standard' };
  const origin = canonicalOrigin(required(env, 'AUTH_URL'));
  if (
    canonicalOrigin(required(env, 'NEXTAUTH_URL')) !== origin ||
    canonicalOrigin(required(env, 'PUBLIC_APP_BASE')) !== origin
  ) {
    throw new DeploymentPolicyError(
      'Staging authentication and application origins must match'
    );
  }
  const secret = required(env, 'NEXTAUTH_SECRET');
  if (
    secret.length < 32 ||
    new Set(secret).size < 10 ||
    /^[a-z]+$/i.test(secret) ||
    /^[0-9]+$/.test(secret) ||
    ['replace-me', 'changeme', 'secret'].includes(secret) ||
    (env.AUTH_SECRET !== undefined && env.AUTH_SECRET !== secret)
  ) {
    throw new DeploymentPolicyError(
      'Staging requires a dedicated authentication secret and matching aliases'
    );
  }
  const host = required(env, 'KK_STAGING_DATABASE_HOST');
  const directHost = env.KK_STAGING_DIRECT_HOST || host;
  const name = required(env, 'KK_STAGING_DATABASE_NAME');
  const deploymentId = required(env, 'KK_STAGING_DATABASE_ID');
  if (
    !/^[a-z0-9.-]+$/.test(host) ||
    !/^[a-z0-9.-]+$/.test(directHost) ||
    !/^[A-Za-z0-9_-]{1,63}$/.test(name) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(deploymentId)
  ) {
    throw new DeploymentPolicyError(
      'Staging database pins and deployment identity are invalid'
    );
  }
  return {
    mode: 'staging',
    origin,
    databaseName: name,
    deploymentId,
    databaseUrl: stagingDatabaseUrl(required(env, 'DATABASE_URL'), host, name),
    directUrl: stagingDatabaseUrl(
      required(env, 'DIRECT_URL'),
      directHost,
      name
    ),
  };
}

/** Use payments only at external gateway boundaries; OFFLINE remains usable. */
export function assertProviderAllowed(
  capability: ProviderCapability,
  env: DeploymentEnvironment = process.env
): void {
  if (isStagingDeployment(env)) {
    throw new DeploymentPolicyError(
      `External capability is disabled in staging: ${capability}`
    );
  }
  assertDeploymentPolicy(env);
}
