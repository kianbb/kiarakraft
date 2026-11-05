import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import {
  root,
  localDir,
  localHeader,
  readLocalConfig,
  defaultPorts,
  integerPort,
  safeEnvironment,
} from './environment.mjs';
import { localDatabase } from './local-db.mjs';
import { prepareDatabase } from './prepare-database.mjs';
import { nodeTool } from './run.mjs';

try {
  if (Number(process.versions.node.split('.')[0]) !== 22)
    throw new Error('Use Node.js 22: nvm use.');
  const config = readLocalConfig();
  const filename = path.join(root, '.env.local');
  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  if (!existsSync(filename)) {
    const defaults = defaultPorts();
    const dbPort = integerPort(process.env.KK_LOCAL_DB_PORT, defaults.db);
    const appPort = integerPort(process.env.KK_APP_PORT, defaults.app);
    const password = randomBytes(24).toString('hex');
    const database = new URL(`postgresql://127.0.0.1:${dbPort}`);
    database.username = 'kiarakraft';
    database.password = password;
    writeFileSync(
      filename,
      `${localHeader}\nKK_LOCAL_DB_PORT=${dbPort}\nKK_APP_PORT=${appPort}\nDATABASE_URL=${new URL('/kiarakraft_dev', database).href}\nDIRECT_URL=${new URL('/kiarakraft_dev', database).href}\nKK_TEST_DATABASE_URL=${new URL('/kiarakraft_test', database).href}\nNEXTAUTH_SECRET=${randomBytes(32).toString('base64url')}\n`,
      { mode: 0o600, flag: 'wx' }
    );
  } else if (!config.DATABASE_URL || !config.KK_TEST_DATABASE_URL)
    throw new Error(
      'Managed local environment is incomplete; refusing to replace it.'
    );
  chmodSync(filename, 0o600);
  await nodeTool('prisma/build/index.js', ['generate'], safeEnvironment());
  await localDatabase('start');
  await prepareDatabase('dev');
  await prepareDatabase('test');
  console.log(
    'Setup complete. Start with npm run dev:local. Only generated local settings were used; hosted credentials were not loaded.'
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
