import { safeEnvironment } from './environment.mjs';
import { connectLocal, verifyIdentity } from './database.mjs';
import { run } from './run.mjs';

try {
  const env = safeEnvironment({ kind: 'test', nodeEnv: 'test' });
  const client = await connectLocal(env.DATABASE_URL, 'test');
  try {
    await verifyIdentity(client, 'test');
  } finally {
    await client.end();
  }
  env.KK_TEST_DATABASE_VERIFIED = '1';
  await run(
    process.execPath,
    ['test/ai-actor-migration.integration.test.mjs'],
    env
  );
  await run(
    process.execPath,
    ['--import', 'tsx', 'test/search.partial.test.ts'],
    env
  );
  await run(
    process.execPath,
    ['--import', 'tsx', 'test/orderStock.integration.test.ts'],
    env
  );
  for (const file of ['password-reset', 'ai-budget', 'identity-fingerprint']) {
    await run(
      process.execPath,
      ['--import', 'tsx', `test/${file}.integration.test.ts`],
      env
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
