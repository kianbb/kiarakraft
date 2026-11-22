import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { root, safeEnvironment } from './environment.mjs';
import { run } from './run.mjs';

export async function createTaskWorktree(
  slug,
  {
    baseRoot = root,
    base = 'HEAD',
    environment = safeEnvironment(),
    execute = run,
  } = {}
) {
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,50}$/.test(slug))
    throw new Error(
      'Use npm run worktree:new -- task-name (lowercase letters, numbers, hyphens).'
    );
  const directory = path.join(baseRoot, '.worktrees', slug);
  if (existsSync(directory))
    throw new Error(
      'Worktree directory already exists; refusing to overwrite it.'
    );
  let revision = 'HEAD';
  if (base !== 'HEAD') {
    try {
      revision = execFileSync(
        'git',
        [
          '-C',
          baseRoot,
          'rev-parse',
          '--verify',
          '--end-of-options',
          `${base}^{commit}`,
        ],
        {
          env: environment,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) throw new Error();
    } catch {
      throw new Error(
        'Choose a valid local branch or commit as the worktree base.'
      );
    }
  }
  mkdirSync(path.dirname(directory), { recursive: true });
  await execute(
    'git',
    [
      '-C',
      baseRoot,
      'worktree',
      'add',
      '--no-checkout',
      '-b',
      `task/${slug}`,
      directory,
      revision,
    ],
    environment
  );
  // The repository still tracks a legacy SQLite file. Exclude that data from
  // worker checkouts while preserving it in the primary checkout and history.
  await execute(
    'git',
    [
      '-C',
      directory,
      'sparse-checkout',
      'set',
      '--no-cone',
      '/*',
      '!/prisma/dev.db',
      '!/.env*',
      '/.env.example',
      '!/.vercel/',
      '!/.local/',
      '!/.demo-credentials.txt',
    ],
    environment
  );
  // Patterns are now in place before the first checkout/materialization. Do
  // not populate then remove a legacy database: filters/hooks could read it.
  await execute(
    'git',
    ['-C', directory, 'read-tree', '-mu', 'HEAD'],
    environment
  );
  return directory;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: 'string', default: 'HEAD' },
      'main-checkout': { type: 'boolean' },
      setup: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1) {
    throw new Error('Provide one worktree name.');
  }
  const environment = safeEnvironment();
  const baseRoot = values['main-checkout']
    ? path.dirname(
        execFileSync(
          'git',
          [
            '-C',
            root,
            'rev-parse',
            '--path-format=absolute',
            '--git-common-dir',
          ],
          { env: environment, encoding: 'utf8' }
        ).trim()
      )
    : root;
  const directory = await createTaskWorktree(positionals[0], {
    baseRoot,
    base: values.base,
    environment,
  });
  if (values.setup) {
    // The new checkout chooses its own ports and generates its own fixture keys.
    const setupEnvironment = Object.fromEntries(
      Object.entries(environment).filter(([name]) =>
        [
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
        ].includes(name)
      )
    );
    await run(
      'npm',
      ['ci', '--legacy-peer-deps', '--ignore-scripts'],
      setupEnvironment,
      { cwd: directory }
    );
    await run('npm', ['run', 'setup'], setupEnvironment, { cwd: directory });
    console.log('Task worktree created and isolated setup completed.');
    return;
  }
  console.log(
    'Task worktree created without copied credentials. Open it in a new VS Code window, then run npm ci --legacy-peer-deps and npm run setup.'
  );
  console.log('A worktree starts at the selected committed revision.');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
