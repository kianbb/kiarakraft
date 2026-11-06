import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, safeEnvironment, readLocalConfig } from './environment.mjs';
import { connectLocal, verifyIdentity } from './database.mjs';

export async function run(command, args, env, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    ...options,
  });
  const forward = signal => child.kill(signal);
  const interrupt = () => forward('SIGINT');
  const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    if (code !== 0)
      throw new Error(
        `Command failed (${path.basename(command)}, exit ${code}).`
      );
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}

export const nodeTool = (tool, args, env) =>
  run(
    process.execPath,
    [path.join(root, 'node_modules', ...tool.split('/')), ...args],
    env
  );

async function main() {
  const mode = process.argv[2];
  if (
    ['dev', 'start'].includes(mode) &&
    !readLocalConfig().DATABASE_URL &&
    !(process.env.CI && process.env.KK_TEST_DATABASE_URL)
  ) {
    throw new Error('Run npm run setup before starting the local application.');
  }
  const env = safeEnvironment({
    nodeEnv: ['build', 'start'].includes(mode)
      ? 'production'
      : mode === 'test'
        ? 'test'
        : 'development',
  });
  switch (mode) {
    case 'test':
      for (const file of [
        'chooseLocale',
        'admin.verifySeller',
        'orderStatus',
        'preflight',
        'payments.preflight',
        'translator',
        'checkout.shipping',
        'cron-auth',
        'auth-session',
        'auth-redirect',
        'public-products',
        'product-image-order',
        'seller.orders',
        'commerce.orderability',
        'dynamic-routes',
        'product-input',
        'translation-budget',
        'password-reset',
        'ai-budget',
        'deployment-policy',
        'staging-side-effects',
        'staging-extra-boundaries',
        'dependency-adapters',
      ]) {
        await run(
          process.execPath,
          ['--import', 'tsx', `test/${file}.test.ts`],
          env
        );
      }
      await run(
        process.execPath,
        ['--test', 'test/service-worker.test.mjs'],
        env
      );
      break;
    case 'build':
      await nodeTool('prisma/build/index.js', ['generate'], env);
      await nodeTool('next/dist/bin/next', ['build', '--webpack'], env);
      break;
    case 'dev':
    case 'start':
      {
        const client = await connectLocal(
          env.DATABASE_URL,
          env.KK_DATABASE_KIND
        );
        try {
          await verifyIdentity(client, env.KK_DATABASE_KIND);
        } finally {
          await client.end();
        }
      }
      await nodeTool(
        'next/dist/bin/next',
        [mode, '--hostname', '127.0.0.1', '--port', env.PORT],
        env
      );
      break;
    case 'i18n':
      await run(
        process.execPath,
        ['--import', 'tsx', 'test/i18n.smoke.test.ts'],
        env
      );
      break;
    case 'generate':
      await nodeTool('prisma/build/index.js', ['generate'], env);
      break;
    case 'legacy-moderation':
      await run(
        process.execPath,
        ['--import', 'tsx', 'test/moderation.test.ts'],
        env
      );
      break;
    default:
      throw new Error('Unknown isolated command.');
  }
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
