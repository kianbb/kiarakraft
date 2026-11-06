#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const MAX_FINDINGS = 100;
const gitEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };

const rules = [
  ['openai-token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/g],
  [
    'github-token',
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g,
  ],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ['stripe-live-key', /\b(?:sk|rk)_live_[A-Za-z0-9]{24,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  [
    'private-key',
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  ],
];

function placeholder(value) {
  return (
    /^(?:replace[-_]?me|change[-_]?me|(?:re_|sk-)?your[-_]|test(?:[-_]|$)|mock(?:[-_]|$)|example(?:[-_]|$)|local[-_]only|dev[-_]only|development[-_]only)/i.test(
      value
    ) ||
    [
      'performance-test-secret',
      'production-secret-generated-with-openssl-rand-base64-32',
    ].includes(value) ||
    /^(?:\$|process\.env\.|<|\.{3})/.test(value)
  );
}

function placeholderDatabaseUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const exampleHost =
      [
        'host',
        'host-pooler.region.neon.tech',
        'host.region.neon.tech',
      ].includes(host) ||
      host.endsWith('.example') ||
      host.endsWith('.invalid');
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(host);
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    return (
      placeholder(password) ||
      ((localHost || exampleHost) &&
        [
          'user:pass',
          'user:password',
          'username:password',
          'postgres:postgres',
          'test:test',
          'review:review',
          'local:local',
          'kiarakraft:kiarakraft',
        ].includes(`${user}:${password}`))
    );
  } catch {
    return false;
  }
}

/** Returns locations and rule names only; never returns matched secret values. */
export function scanText(text) {
  const findings = [];
  const add = (rule, index) => {
    if (findings.length >= MAX_FINDINGS)
      throw new Error('Finding limit reached; scan incomplete.');
    findings.push({ rule, line: text.slice(0, index).split('\n').length });
  };
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) add(rule, match.index);
  }
  const databases =
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/[^\s"'`<>]+/gi;
  for (const match of text.matchAll(databases)) {
    if (
      /^[^:]+:\/\/[^/@]+:[^/@]+@/.test(match[0]) &&
      !placeholderDatabaseUrl(match[0])
    ) {
      add('database-credentials', match.index);
    }
  }
  // Entire literal assignments only: do not consume the next line after an empty
  // setting or mistake a function call that generates a key for a literal key.
  const assignments =
    /^[ \t]*(?:NEXTAUTH_SECRET|AUTH_SECRET|CLOUDINARY_API_SECRET|SMTP_PASS(?:WORD)?|DATABASE_PASSWORD|OPENAI_API_KEY|AZURE_TRANSLATOR_KEY|RESEND_API_KEY|SEED_TOKEN|CRON_SECRET)[ \t]*[:=][ \t]*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([A-Za-z0-9_+/=!-]{16,}))[ \t]*[,;]?[ \t]*(?:#.*)?$/gm;
  for (const match of text.matchAll(assignments)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value.length >= 16 && !placeholder(value))
      add('literal-sensitive-setting', match.index);
  }
  return findings;
}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      env: gitEnv,
      maxBuffer: MAX_BLOB_BYTES,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('Git read failed; scan incomplete.');
  }
}

function sensitiveArtifact(name, { includeLegacyDatabase = false } = {}) {
  const parts = name.toLowerCase().split('/');
  const basename = parts.at(-1);
  const example =
    basename === '.env.example' || /^\.env\..+\.example$/.test(basename);
  return (
    parts.includes('.local') ||
    parts.includes('.vercel') ||
    basename === '.demo-credentials.txt' ||
    ((basename === '.env' || basename.startsWith('.env.')) && !example) ||
    (includeLegacyDatabase && name.toLowerCase() === 'prisma/dev.db')
  );
}

export async function scanRepository({
  cwd = process.cwd(),
  mode = '--staged',
  report = console.error,
} = {}) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).toString().trim();
  let count = 0;
  let findings = 0;
  const record = (name, finding) => {
    findings += 1;
    report(
      `${JSON.stringify(name)}:${finding.line} [${finding.rule}] sensitive content or artifact (redacted)`
    );
    if (findings >= MAX_FINDINGS)
      throw new Error('Finding limit reached; scan incomplete.');
  };
  const inspect = (name, bytes) => {
    count += 1;
    // Scan byte-decoded content even when NULs are present: a binary marker must
    // not provide a bypass for an otherwise recognizable embedded credential.
    for (const finding of scanText(bytes.toString('utf8'))) {
      record(name, finding);
    }
  };
  if (mode === '--all-history') {
    // Pipe object metadata instead of holding the repository's history in memory.
    const revisions = spawn(
      'git',
      [
        '-C',
        root,
        '-c',
        'core.quotePath=true',
        'rev-list',
        '--objects',
        '--all',
      ],
      { env: gitEnv, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const metadata = spawn(
      'git',
      [
        '-C',
        root,
        'cat-file',
        '--batch-check=%(objectname) %(objecttype) %(objectsize) %(rest)',
      ],
      { env: gitEnv, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const completion = child =>
      new Promise((resolve, reject) => {
        child.once('error', () =>
          reject(new Error('Git history traversal failed.'))
        );
        child.once('close', code =>
          code === 0
            ? resolve()
            : reject(new Error('Git history traversal failed.'))
        );
      });
    const completed = Promise.all([
      completion(revisions),
      completion(metadata),
    ]);
    // Attach a handler immediately so early subprocess failures cannot go unhandled.
    completed.catch(() => {});
    revisions.stdout.pipe(metadata.stdin);
    metadata.stdin.on('error', () => {});
    try {
      for await (const line of createInterface({
        input: metadata.stdout,
        crlfDelay: Infinity,
      })) {
        const match = /^([a-f0-9]+) (\S+) (\d+) ?(.*)$/.exec(line);
        if (!match)
          throw new Error('Unexpected Git metadata; scan incomplete.');
        if (match[2] !== 'blob') continue;
        if (Number(match[3]) > MAX_BLOB_BYTES)
          throw new Error('Oversized history blob; scan incomplete.');
        inspect(
          `${match[4] || '(unnamed blob)'} @ ${match[1].slice(0, 12)}`,
          git(root, ['cat-file', 'blob', match[1]])
        );
      }
      await completed;
    } finally {
      revisions.kill();
      metadata.kill();
    }
  } else {
    const args =
      mode === '--staged'
        ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
        : ['ls-files', '-z'];
    for (const name of git(root, args).toString().split('\0').filter(Boolean)) {
      // Generated local credentials may be random values with no recognizable
      // provider prefix. Block their paths even when force-added past gitignore.
      // The already tracked SQLite file remains preserved; any staged addition
      // or modification of it is blocked rather than grandfathered into commits.
      if (
        sensitiveArtifact(name, { includeLegacyDatabase: mode === '--staged' })
      ) {
        count += 1;
        record(name, { line: 1, rule: 'sensitive-artifact-path' });
        continue;
      }
      if (mode === '--staged') {
        inspect(name, git(root, ['show', `:${name}`]));
      } else {
        const filename = path.join(root, name);
        let stat;
        try {
          stat = lstatSync(filename);
        } catch {
          throw new Error('Tracked file unavailable; scan incomplete.');
        }
        if (stat.isSymbolicLink()) {
          inspect(name, Buffer.from(readlinkSync(filename)));
        } else if (stat.isFile()) {
          if (stat.size > MAX_BLOB_BYTES)
            throw new Error('Oversized tracked file; scan incomplete.');
          inspect(name, readFileSync(filename));
        } else {
          throw new Error('Unsupported tracked entry; scan incomplete.');
        }
      }
    }
  }
  return { files: count, findings };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] ?? '--staged';
  if (
    args.length > 1 ||
    !['--staged', '--tracked', '--all-history'].includes(mode)
  ) {
    console.error(
      'Usage: node scripts/security/scan-secrets.mjs [--staged|--tracked|--all-history]'
    );
    process.exitCode = 2;
    return;
  }
  try {
    const result = await scanRepository({ mode });
    console.log(
      `Secret scan: ${result.files} blobs/files checked; ${result.findings} findings. No secret values are printed.`
    );
    process.exitCode = result.findings ? 1 : 0;
  } catch {
    // Git errors can contain object contents or credentials: intentionally suppress details.
    console.error(
      'Secret scan could not complete. Resolve scanner or repository errors before proceeding.'
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
