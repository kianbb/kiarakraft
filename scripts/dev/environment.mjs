import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const localDir = path.join(root, '.local');
export const localHeader = '# Kiara Kraft isolated local environment';

export function dotenvKeys(content) {
  return Object.keys(parse(content));
}

export function assertLocalDatabase(value, kind = 'test') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'A dedicated local database URL is required. Run npm run setup.'
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !/^\d+$/.test(url.port) ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    url.pathname !== `/kiarakraft_${kind}` ||
    !url.username ||
    !url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `Refusing database target: require literal loopback, an explicit port, and kiarakraft_${kind}.`
    );
  }
  return url;
}

export function readLocalConfig() {
  const filename = path.join(root, '.env.local');
  if (!existsSync(filename)) return {};
  const content = readFileSync(filename, 'utf8');
  if (!content.startsWith(localHeader + '\n')) {
    throw new Error(
      'Existing .env.local is not managed by this setup; it was left untouched. Move it to secure storage before setup.'
    );
  }
  return parse(content);
}

export function integerPort(value, fallback) {
  const port = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Local ports must be integers between 1024 and 65535.');
  }
  return port;
}

export function defaultPorts() {
  const isWorktree =
    existsSync(path.join(root, '.git')) &&
    statSync(path.join(root, '.git')).isFile();
  const offset =
    parseInt(createHash('sha256').update(root).digest('hex').slice(0, 4), 16) %
    1500;
  return isWorktree
    ? { db: 56000 + offset, app: 4000 + offset }
    : { db: 55432, app: 3000 };
}

// Do not inherit API keys, cloud credentials, NODE_OPTIONS, PG* or npm overrides.
// Empty every dotenv key so Next.js/Prisma cannot fill it from legacy .env files.
export function safeEnvironment({
  kind = 'dev',
  nodeEnv = 'development',
  source = process.env,
  config = readLocalConfig(),
} = {}) {
  const env = {};
  for (const key of [
    'PATH',
    'HOME',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SystemRoot',
    'COMSPEC',
    'LANG',
    'LC_ALL',
    'TERM',
  ]) {
    if (source[key]) env[key] = source[key];
  }
  for (const name of readdirSync(root).filter(name =>
    /^\.env(?:\.|$)/.test(name)
  )) {
    const filename = path.join(root, name);
    try {
      for (const key of dotenvKeys(readFileSync(filename, 'utf8')))
        env[key] = '';
    } catch {
      throw new Error('Unable to inspect dotenv variable names safely.');
    }
  }
  const ports = defaultPorts();
  const dbPort = integerPort(
    source.KK_LOCAL_DB_PORT || config.KK_LOCAL_DB_PORT,
    ports.db
  );
  const appPort = integerPort(
    source.KK_APP_PORT || source.PORT || config.KK_APP_PORT,
    ports.app
  );
  const ciTestUrl = source.CI ? source.KK_TEST_DATABASE_URL : undefined;
  const selectedKind = ciTestUrl ? 'test' : kind;
  const databaseUrl =
    selectedKind === 'test'
      ? source.KK_TEST_DATABASE_URL || config.KK_TEST_DATABASE_URL
      : config.DATABASE_URL;
  // Database-free commands still need a syntactically valid Prisma configuration.
  const fallback = new URL(
    `postgresql://127.0.0.1:${dbPort}/kiarakraft_${selectedKind}`
  );
  fallback.username = 'disabled';
  fallback.password = 'disabled';
  assertLocalDatabase(databaseUrl || fallback.href, selectedKind);
  Object.assign(env, {
    DATABASE_URL: databaseUrl || fallback.href,
    DIRECT_URL: databaseUrl || fallback.href,
    NEXTAUTH_SECRET:
      config.NEXTAUTH_SECRET || randomBytes(32).toString('base64url'),
    NEXTAUTH_URL: `http://127.0.0.1:${appPort}`,
    PUBLIC_APP_BASE: `http://127.0.0.1:${appPort}`,
    ALLOWED_APP_BASE_HOSTS: `127.0.0.1:${appPort}`,
    ALLOWED_CSRF_HOSTS: `127.0.0.1:${appPort}`,
    PAYMENT_GATEWAY: 'OFFLINE',
    ENABLE_SEED_ENDPOINT: 'false',
    TRANSLATOR_PROVIDER: 'mock',
    AI_MONTHLY_USER_BUDGET_USD: '0',
    AI_MONTHLY_GLOBAL_BUDGET_USD: '0',
    AI_TEXT_REQUEST_RESERVATION_USD: '0',
    AI_IMAGE_REQUEST_RESERVATION_USD: '0',
    AI_TRANSLATION_REQUEST_RESERVATION_USD: '0',
    NODE_ENV: nodeEnv,
    NEXT_TELEMETRY_DISABLED: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    KK_LOCAL_DB_PORT: String(dbPort),
    KK_APP_PORT: String(appPort),
    PORT: String(appPort),
    KK_ISOLATED: '1',
    KK_DATABASE_KIND: selectedKind,
  });
  // Auth.js v5 uses AUTH_URL to establish the trusted canonical host. A blank
  // alias from a dotenv example otherwise shadows NEXTAUTH_URL and breaks real
  // production-mode local login. Set both aliases only to the guarded origin.
  env.AUTH_URL = env.NEXTAUTH_URL;
  env.AUTH_SECRET = env.NEXTAUTH_SECRET;
  if (source.CI) env.CI = 'true';
  if (source.NEXT_URL) {
    const url = new URL(source.NEXT_URL);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password
    ) {
      throw new Error('Smoke tests require an explicit HTTP loopback URL.');
    }
    env.NEXT_URL = url.origin;
  } else env.NEXT_URL = env.NEXTAUTH_URL;
  return env;
}
