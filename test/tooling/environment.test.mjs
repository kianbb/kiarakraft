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
    },
    config: {},
  });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.ok(!Object.values(env).includes('test-synthetic-sentinel'));
  assert.ok(!Object.values(env).includes('remote-sentinel'));
  assert.equal(env.TRANSLATOR_PROVIDER, 'mock');
  assert.equal(env.PAYMENT_GATEWAY, 'OFFLINE');
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
