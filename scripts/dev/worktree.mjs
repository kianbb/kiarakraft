import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, safeEnvironment } from './environment.mjs';
import { run } from './run.mjs';

export async function createTaskWorktree(
  slug,
  { baseRoot = root, environment = safeEnvironment(), execute = run } = {}
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
      'HEAD',
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
  await createTaskWorktree(process.argv[2]);
  console.log(
    'Task worktree created without copied credentials. Open it in a new VS Code window, then run npm ci --legacy-peer-deps and npm run setup.'
  );
  console.log(
    'A worktree starts at the committed HEAD; commit reviewed foundation changes before creating workers.'
  );
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
