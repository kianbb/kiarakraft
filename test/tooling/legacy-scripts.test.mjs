import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const legacy = fileURLToPath(new URL('../../scripts/legacy/', import.meta.url));
const entries = readdirSync(legacy).filter(
  name => name.endsWith('.ts') && name !== 'require-opt-in.ts'
);
const env = { PATH: process.env.PATH };

test('legacy scripts exit before running without an opt-in', () => {
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(legacy, entry)],
      {
        cwd: legacy,
        env,
        encoding: 'utf8',
        timeout: 5000,
      }
    );
    assert.equal(result.status, 1, entry);
    assert.match(
      result.stderr,
      /Legacy script blocked.*KIARA_ALLOW_LEGACY_SCRIPT=1/,
      entry
    );
  }
});

test('legacy reset remains disabled even with the opt-in', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(legacy, 'guard-reset.ts')],
    {
      cwd: legacy,
      env: { ...env, KIARA_ALLOW_LEGACY_SCRIPT: '1' },
      encoding: 'utf8',
      timeout: 5000,
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Database resets are disabled/);
});
