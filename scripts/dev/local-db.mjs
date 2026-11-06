import {
  existsSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localDir,
  readLocalConfig,
  safeEnvironment,
  assertLocalDatabase,
} from './environment.mjs';
import { run } from './run.mjs';
import { isolatedClient } from './database.mjs';

function postgresBin() {
  const candidates = [
    process.env.KK_PG_BIN,
    '/opt/homebrew/opt/postgresql@16/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/usr/lib/postgresql/16/bin',
  ];
  for (const candidate of candidates.filter(Boolean)) {
    if (existsSync(path.join(candidate, 'pg_ctl'))) return candidate;
  }
  const probe = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const value = probe.stdout?.trim();
  if (probe.status === 0 && value && existsSync(path.join(value, 'pg_ctl')))
    return value;
  throw new Error(
    'Install PostgreSQL 16 (including contrib extensions), or set KK_PG_BIN to its bin directory.'
  );
}

export async function localDatabase(action = 'start') {
  const config = readLocalConfig();
  if (!config.DATABASE_URL)
    throw new Error(
      'Run npm run setup to create the isolated environment first.'
    );
  const url = assertLocalDatabase(config.DATABASE_URL, 'dev');
  const bin = postgresBin();
  const env = { ...safeEnvironment(), LANG: 'C', LC_ALL: 'C' };
  const directory = path.join(localDir, 'postgres');
  const logfile = path.join(localDir, 'postgres.log');
  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  if (action === 'stop') {
    if (existsSync(path.join(directory, 'PG_VERSION')))
      await run(
        path.join(bin, 'pg_ctl'),
        ['-D', directory, '-w', 'stop', '-m', 'fast'],
        env
      );
    return;
  }
  if (action !== 'start') throw new Error('Expected start or stop.');
  if (!existsSync(path.join(directory, 'PG_VERSION'))) {
    const passwordFile = path.join(localDir, 'initdb-password');
    writeFileSync(passwordFile, decodeURIComponent(url.password) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      await run(
        path.join(bin, 'initdb'),
        [
          '-D',
          directory,
          '-U',
          decodeURIComponent(url.username),
          '--encoding=UTF8',
          '--locale=C',
          '--auth-local=scram-sha-256',
          '--auth-host=scram-sha-256',
          '--pwfile',
          passwordFile,
        ],
        env
      );
      appendFileSync(
        path.join(directory, 'postgresql.conf'),
        `\n# Kiara Kraft local-only listener\nlisten_addresses = '127.0.0.1'\nport = ${url.port}\nunix_socket_directories = ''\n`
      );
    } finally {
      unlinkSync(passwordFile);
    }
  }
  const status = spawnSync(
    path.join(bin, 'pg_ctl'),
    ['-D', directory, 'status'],
    { env, stdio: 'ignore' }
  );
  if (status.status !== 0)
    await run(
      path.join(bin, 'pg_ctl'),
      ['-D', directory, '-l', logfile, '-w', 'start'],
      env
    );
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = isolatedClient(adminUrl);
  await client.connect();
  try {
    // Establish that this is our cluster, not another listener using the port.
    const identity = await client.query('SHOW data_directory');
    if (
      path.resolve(identity.rows[0].data_directory) !== path.resolve(directory)
    )
      throw new Error('Port belongs to a different PostgreSQL cluster.');
    for (const kind of ['dev', 'test']) {
      const name = `kiarakraft_${kind}`;
      const result = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [name]
      );
      if (!result.rowCount) await client.query(`CREATE DATABASE "${name}"`);
    }
    console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}.`);
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  localDatabase(process.argv[2] || 'start').catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
