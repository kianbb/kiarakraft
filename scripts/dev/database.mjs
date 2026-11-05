import pg from 'pg';
import { assertLocalDatabase } from './environment.mjs';

export async function connectLocal(value, kind) {
  const client = isolatedClient(assertLocalDatabase(value, kind));
  await client.connect();
  return client;
}

export function isolatedClient(url) {
  const previous = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => /^PG/.test(key))
  );
  for (const key of Object.keys(previous)) delete process.env[key];
  try {
    return new pg.Client(localConnectionOptions(url));
  } finally {
    Object.assign(process.env, previous);
  }
}

export function localConnectionOptions(url) {
  return {
    host: '127.0.0.1',
    port: Number(url.port),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: false,
    options: '-c search_path=public',
    client_encoding: 'UTF8',
    application_name: 'kiarakraft-isolated',
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    query_timeout: 30000,
  };
}

export async function verifyIdentity(client, kind, { provision = false } = {}) {
  const identity = await client.query('SELECT current_database() AS name');
  if (identity.rows[0].name !== `kiarakraft_${kind}`)
    throw new Error('Database identity mismatch.');
  const marker = await client.query(
    "SELECT to_regclass('kk_local_guard.identity') AS marker"
  );
  if (!marker.rows[0].marker) {
    const tables = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') LIMIT 1"
    );
    if (!provision || tables.rowCount)
      throw new Error(
        'Refusing an unmarked database with existing objects. Use a new empty local database.'
      );
    await client.query('CREATE SCHEMA kk_local_guard');
    await client.query(
      'CREATE TABLE kk_local_guard.identity (kind text PRIMARY KEY, purpose text NOT NULL)'
    );
    await client.query('INSERT INTO kk_local_guard.identity VALUES ($1, $2)', [
      kind,
      'synthetic-only-v1',
    ]);
  }
  const result = await client.query(
    'SELECT purpose FROM kk_local_guard.identity WHERE kind = $1',
    [kind]
  );
  if (result.rows[0]?.purpose !== 'synthetic-only-v1')
    throw new Error('Missing synthetic database marker.');
}
