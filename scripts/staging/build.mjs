import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { require as tsxRequire } from 'tsx/cjs/api';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function run(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (code !== 0) throw new Error('Deployment build step failed');
}

async function main() {
  const { assertDeploymentPolicy } = tsxRequire(
    '../../lib/deployment-policy.ts',
    import.meta.url
  );
  const { verifyStagingDatabaseTargets } = tsxRequire(
    '../../lib/staging-database.ts',
    import.meta.url
  );
  // Preflight precedes Prisma generation and all Next static/metadata reads.
  const policy = assertDeploymentPolicy();
  await verifyStagingDatabaseTargets();
  if (process.argv.includes('--preflight-only')) return;
  // Explicit child values also take precedence over conventional dotenv files.
  const env = { ...process.env };
  if (policy.mode === 'staging') {
    env.DATABASE_URL = policy.databaseUrl.href;
    env.DIRECT_URL = policy.directUrl.href;
  }
  await run(
    [path.join(root, 'node_modules/prisma/build/index.js'), 'generate'],
    env
  );
  await run(
    [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'],
    env
  );
}

main().catch(() => {
  // Raw connection/build exceptions may include credentials or query details.
  console.error(
    'Deployment preflight/build failed; verify the configured staging policy and database identity.'
  );
  process.exitCode = 1;
});
