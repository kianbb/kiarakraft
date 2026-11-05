import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanText } from '../../scripts/security/scan-secrets.mjs';

const scanner = fileURLToPath(
  new URL('../../scripts/security/scan-secrets.mjs', import.meta.url)
);
const token = ['sk-', 'proj-', 'A'.repeat(45)].join('');
const githubToken = ['ghp_', 'Z'.repeat(36)].join('');

function repository(t) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'kiarakraft-secret-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-C', cwd, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  git('init', '--quiet');
  git('config', 'user.name', 'Synthetic Test');
  git('config', 'user.email', 'synthetic@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  return {
    cwd,
    git,
    run: mode =>
      spawnSync(process.execPath, [scanner, mode], { cwd, encoding: 'utf8' }),
  };
}

test('detects provider keys, private keys and literal settings without returning values', () => {
  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const secret = 'D'.repeat(38);
  const content = `${token}\n${githubToken}\n${privateKey}\nNEXTAUTH_SECRET=${secret}`;
  const findings = scanText(content);
  assert.deepEqual(
    findings.map(x => x.rule),
    ['openai-token', 'github-token', 'private-key', 'literal-sensitive-setting']
  );
  assert.deepEqual(
    findings.map(x => x.line),
    [1, 2, 3, 4]
  );
  for (const value of [token, githubToken, secret])
    assert.ok(!JSON.stringify(findings).includes(value));
});

test('permits explicit examples but detects actual credentials even in an example file', () => {
  const harmless = [
    'postgresql://user:pass@localhost:5432/test',
    'postgresql://user:pass@host-pooler.region.neon.tech/db',
    'NEXTAUTH_SECRET="replace-me"',
    'OPENAI_API_KEY="your-api-key"',
    'AUTH_SECRET="local-only-synthetic-example"',
    'AZURE_TRANSLATOR_KEY=',
    'TRANSLATOR_PROVIDER=azure',
    'NEXTAUTH_SECRET: generateSecureSecret(32),',
  ].join('\n');
  assert.deepEqual(scanText(harmless), []);
  const credentialed = [
    'postgresql:',
    '//actualuser:',
    'substantialsecret',
    '@db.company.invalid/main',
  ].join('');
  const misleadingExample = [
    'postgresql:',
    '//user:pass',
    '@real.example.com/main',
  ].join('');
  assert.equal(scanText(credentialed).length, 1);
  assert.equal(scanText(misleadingExample).length, 1);
});

test('staged mode reads index blobs rather than working files, including spaces and shell metacharacters', t => {
  const { cwd, git, run } = repository(t);
  const filename = 'odd name $(touch SHOULD_NOT_EXIST).txt';
  writeFileSync(path.join(cwd, filename), token);
  git('add', '--', filename);
  writeFileSync(path.join(cwd, filename), 'safe working copy');
  const result = run('--staged');
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('openai-token'));
  assert.ok(result.stderr.includes('redacted'));
  assert.ok(!(result.stdout + result.stderr).includes(token));
  writeFileSync(path.join(cwd, filename), 'safe index');
  git('add', '--', filename);
  writeFileSync(path.join(cwd, filename), token);
  assert.equal(run('--staged').status, 0);
  assert.equal(run('--tracked').status, 1);
});

test('tracked mode does not follow a tracked symlink outside the repository', t => {
  const { cwd, git, run } = repository(t);
  const outside = mkdtempSync(
    path.join(os.tmpdir(), 'kiarakraft-secret-outside-')
  );
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, 'secret'), token);
  symlinkSync(path.join(outside, 'secret'), path.join(cwd, 'link'));
  git('add', 'link');
  assert.equal(run('--tracked').status, 0);
});

test('a binary marker does not bypass scanning embedded credentials', t => {
  const { cwd, git, run } = repository(t);
  writeFileSync(path.join(cwd, 'binary.dat'), Buffer.from(`\0${token}`));
  git('add', 'binary.dat');
  assert.equal(run('--staged').status, 1);
  assert.equal(run('--tracked').status, 1);
});

test('pre-commit stops before lint-staged when the staged scanner fails', t => {
  const { cwd, git } = repository(t);
  mkdirSync(path.join(cwd, 'scripts/security'), { recursive: true });
  copyFileSync(scanner, path.join(cwd, 'scripts/security/scan-secrets.mjs'));
  writeFileSync(path.join(cwd, 'fixture.txt'), token);
  git('add', 'fixture.txt');
  const bin = path.join(cwd, 'bin');
  mkdirSync(bin);
  const marker = path.join(cwd, 'lint-ran');
  const fakeNpx = path.join(bin, 'npx');
  writeFileSync(fakeNpx, '#!/bin/sh\nprintf ran > "$KK_SCANNER_TEST_MARKER"\n');
  chmodSync(fakeNpx, 0o755);
  const hook = fileURLToPath(
    new URL('../../.husky/pre-commit', import.meta.url)
  );
  const result = spawnSync('sh', [hook], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      KK_SCANNER_TEST_MARKER: marker,
    },
  });
  assert.equal(result.status, 1);
  assert.equal(existsSync(marker), false);
  assert.ok(!(result.stdout + result.stderr).includes(token));
});

test('history mode finds a removed credential and fails without disclosing it', t => {
  const { cwd, git, run } = repository(t);
  mkdirSync(path.join(cwd, 'fixtures'));
  const name = 'fixtures/old config.txt';
  writeFileSync(path.join(cwd, name), githubToken);
  git('add', name);
  git('commit', '--quiet', '-m', 'synthetic fixture');
  git('rm', '--quiet', name);
  git('commit', '--quiet', '-m', 'remove fixture');
  assert.equal(run('--tracked').status, 0);
  const result = run('--all-history');
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('github-token'));
  assert.ok(!(result.stdout + result.stderr).includes(githubToken));
});

test('scanner errors and unsupported arguments fail closed', t => {
  const { cwd, git, run } = repository(t);
  writeFileSync(
    path.join(cwd, 'oversized.txt'),
    Buffer.alloc(8 * 1024 * 1024 + 1, 'x')
  );
  git('add', 'oversized.txt');
  assert.equal(run('--tracked').status, 2);
  assert.equal(run('--staged').status, 2);
  assert.equal(run('--unknown').status, 2);
});

test('force-added local credentials and deployment artifacts are blocked by path', t => {
  const { cwd, git, run } = repository(t);
  const files = [
    '.local/credentials.json',
    '.vercel/project.json',
    '.env',
    '.env.development.local',
    '.env.example.local',
    '.demo-credentials.txt',
  ];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), '{"password":"synthetic-short-value"}');
  }
  writeFileSync(
    path.join(cwd, '.gitignore'),
    '.local/\n.vercel/\n.env*\n.demo-credentials.txt\n'
  );
  git('add', '--force', '--', ...files);
  for (const mode of ['--staged', '--tracked']) {
    const result = run(mode);
    assert.equal(result.status, 1);
    assert.equal(
      (result.stderr.match(/sensitive-artifact-path/g) || []).length,
      files.length
    );
    assert.ok(
      !(result.stdout + result.stderr).includes('synthetic-short-value')
    );
  }
});

test('explicit environment examples remain content-scanned', t => {
  const { cwd, git, run } = repository(t);
  writeFileSync(
    path.join(cwd, '.env.example'),
    'OPENAI_API_KEY="your-api-key"\n'
  );
  writeFileSync(
    path.join(cwd, '.env.staging.example'),
    'NEXTAUTH_SECRET="replace-me"\n'
  );
  git('add', '.env.example', '.env.staging.example');
  assert.equal(run('--staged').status, 0);
  writeFileSync(path.join(cwd, '.env.example'), token);
  git('add', '.env.example');
  assert.equal(run('--staged').status, 1);
});

test('legacy SQLite is preserved in tracked scans but any staged change is blocked', t => {
  const { cwd, git, run } = repository(t);
  mkdirSync(path.join(cwd, 'prisma'));
  writeFileSync(path.join(cwd, 'prisma/dev.db'), 'synthetic legacy fixture');
  git('add', 'prisma/dev.db');
  assert.equal(run('--staged').status, 1);
  git('commit', '--quiet', '-m', 'synthetic legacy database');
  assert.equal(run('--tracked').status, 0);
  assert.equal(run('--staged').status, 0);
  writeFileSync(
    path.join(cwd, 'prisma/dev.db'),
    'changed synthetic legacy fixture'
  );
  git('add', 'prisma/dev.db');
  assert.equal(run('--staged').status, 1);
});
