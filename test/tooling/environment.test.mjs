import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  assertLocalDatabase,
  safeEnvironment,
  dotenvKeys,
} from '../../scripts/dev/environment.mjs';

test('dotenv masking recognizes colon syntax, exports, and multiline values', () => {
  assert.deepEqual(
    dotenvKeys(
      'OPENAI_API_KEY: synthetic-sentinel\nexport AZURE_TRANSLATOR_KEY="line one\nline two"\nSENTRY_AUTH_TOKEN=synthetic-sentinel'
    ),
    ['OPENAI_API_KEY', 'AZURE_TRANSLATOR_KEY', 'SENTRY_AUTH_TOKEN']
  );
});

test('only dedicated literal-loopback database URLs are accepted', () => {
  const valid = 'postgresql://test:test@127.0.0.1:55432/kiarakraft_test';
  assert.doesNotThrow(() => assertLocalDatabase(valid));
  for (const value of [
    valid.replace('127.0.0.1', 'localhost'),
    valid.replace('127.0.0.1', 'db.neon.tech'),
    valid.replace('kiarakraft_test', 'production'),
    valid + '?host=db.neon.tech',
    valid + '?schema=production',
    valid.replace(':55432', ''),
    valid.replace('127.0.0.1', '127.0.0.1.evil.invalid'),
  ]) {
    assert.throws(() => assertLocalDatabase(value));
  }
});

test('child environment excludes inherited credentials and preload hooks', () => {
  const env = safeEnvironment({
    source: {
      PATH: '/bin',
      OPENAI_API_KEY: 'test-synthetic-sentinel',
      DATABASE_URL: 'remote-sentinel',
      NODE_OPTIONS: '--import evil',
      AWS_SECRET_ACCESS_KEY: 'test-synthetic-sentinel',
      SENTRY_AUTH_TOKEN: 'test-synthetic-sentinel',
      AI_MONTHLY_GLOBAL_BUDGET_USD: '99',
      AI_IMAGE_REQUEST_RESERVATION_USD: '10',
      IDENTITY_HASH_KEY: 'test-synthetic-sentinel',
      IDENTITY_HASH_KEY_ID: 'test-synthetic-sentinel',
    },
    config: {},
  });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.ok(!Object.values(env).includes('test-synthetic-sentinel'));
  assert.ok(!Object.values(env).includes('remote-sentinel'));
  assert.equal(env.TRANSLATOR_PROVIDER, 'mock');
  assert.equal(env.PAYMENT_GATEWAY, 'OFFLINE');
  assert.equal(env.IDENTITY_HASH_KEY, '');
  assert.equal(env.IDENTITY_HASH_KEY_ID, '');
  assert.equal(env.DATABASE_URL, env.DIRECT_URL);
  assert.equal(env.AI_MONTHLY_GLOBAL_BUDGET_USD, '0');
  assert.equal(env.AI_MONTHLY_USER_BUDGET_USD, '0');
  assert.equal(env.AI_IMAGE_REQUEST_RESERVATION_USD, '0');
  assert.equal(env.AI_TEXT_REQUEST_RESERVATION_USD, '0');
  assert.equal(env.AI_TRANSLATION_REQUEST_RESERVATION_USD, '0');
});

test('CI rejects a remote test URL before launching any command', () => {
  assert.throws(() =>
    safeEnvironment({
      source: {
        CI: 'true',
        KK_TEST_DATABASE_URL:
          'postgresql://user:pass@remote.invalid:5432/kiarakraft_test',
      },
      config: {},
    })
  );
});

test('nested CI launchers retain only the validated loopback test database', () => {
  const databaseUrl = 'postgresql://user:pass@127.0.0.1:55439/kiarakraft_test';
  let env = safeEnvironment({
    kind: 'test',
    nodeEnv: 'test',
    source: {
      CI: 'true',
      KK_LOCAL_DB_PORT: '55439',
      KK_TEST_DATABASE_URL: databaseUrl,
      DATABASE_URL: 'remote-database-sentinel',
      DIRECT_URL: 'remote-direct-sentinel',
      OPENAI_API_KEY: 'test-provider-sentinel',
    },
    config: {},
  });

  // CI has no generated .env.local. Each real nested launcher sanitizes again.
  for (let depth = 0; depth < 3; depth++) {
    env = safeEnvironment({
      kind: 'test',
      nodeEnv: 'test',
      source: env,
      config: {},
    });
    assert.equal(env.CI, 'true');
    assert.equal(env.DATABASE_URL, databaseUrl);
    assert.equal(env.DIRECT_URL, databaseUrl);
    assert.equal(env.KK_TEST_DATABASE_URL, databaseUrl);
    assert.equal(env.KK_DATABASE_KIND, 'test');
    assert.ok(!Object.values(env).includes('test-provider-sentinel'));
    assert.ok(!Object.values(env).includes('remote-database-sentinel'));
    assert.ok(!Object.values(env).includes('remote-direct-sentinel'));
  }

  // A sanitized parent is not a bypass: a changed child target is revalidated.
  for (const value of [
    databaseUrl.replace('127.0.0.1', 'remote.invalid'),
    databaseUrl.replace('kiarakraft_test', 'kiarakraft_dev'),
    databaseUrl + '?host=remote.invalid',
  ]) {
    assert.throws(() =>
      safeEnvironment({
        kind: 'test',
        source: { ...env, KK_TEST_DATABASE_URL: value },
        config: {},
      })
    );
  }
});

test('Auth.js aliases use only the generated loopback host and local secret', () => {
  const inheritedSecret = randomBytes(32).toString('base64url');
  const env = safeEnvironment({
    source: {
      AUTH_URL: 'https://remote.invalid',
      AUTH_SECRET: inheritedSecret,
      AUTH_TRUST_HOST: 'true',
    },
    config: {},
    nodeEnv: 'production',
  });
  assert.equal(new URL(env.AUTH_URL).hostname, '127.0.0.1');
  assert.equal(new URL(env.AUTH_URL).protocol, 'http:');
  assert.equal(env.AUTH_URL, env.NEXTAUTH_URL);
  assert.equal(env.AUTH_SECRET, env.NEXTAUTH_SECRET);
  assert.notEqual(env.AUTH_SECRET, inheritedSecret);
});

test('smoke tests cannot be redirected to a remote URL', () => {
  assert.throws(() =>
    safeEnvironment({
      source: { NEXT_URL: 'https://www.kiarakraft.com' },
      config: {},
    })
  );
});

test('document collection remains disabled despite inherited or configured activation', () => {
  for (const nodeEnv of ['development', 'production', 'test']) {
    const env = safeEnvironment({
      nodeEnv,
      source: { SELLER_DOCUMENT_COLLECTION_ENABLED: 'true' },
      config: { SELLER_DOCUMENT_COLLECTION_ENABLED: 'true' },
    });
    assert.equal(env.SELLER_DOCUMENT_COLLECTION_ENABLED, 'false');
    assert.equal(env.KK_ISOLATED, '1');
  }
});
