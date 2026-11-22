import './require-opt-in';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const prisma = require.resolve('prisma/build/index.js');
const result = spawnSync(
  process.execPath,
  [prisma, 'migrate', 'resolve', '--applied', '202508191343_init'],
  { stdio: 'inherit' }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
