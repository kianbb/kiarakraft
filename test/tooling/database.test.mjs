import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  connectLocal,
  verifyIdentity,
  isolatedClient,
} from '../../scripts/dev/database.mjs';

test('pg environment variables cannot modify a local connection', () => {
  const saved = {
    PGOPTIONS: process.env.PGOPTIONS,
    PGREPLICATION: process.env.PGREPLICATION,
    PGSSLMODE: process.env.PGSSLMODE,
  };
  try {
    process.env.PGOPTIONS = '-c search_path=unexpected';
    process.env.PGREPLICATION = 'database';
    process.env.PGSSLMODE = 'require';
    const client = isolatedClient(
      new URL('postgresql://test:test@127.0.0.1:55432/kiarakraft_test')
    );
    assert.equal(client.connectionParameters.options, '-c search_path=public');
    assert.equal(client.connectionParameters.replication, undefined);
    assert.equal(client.connectionParameters.ssl, false);
    assert.equal(process.env.PGREPLICATION, 'database');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('remote database targets are rejected before connecting', async () => {
  await assert.rejects(
    connectLocal(
      'postgresql://user:pass@remote.invalid:5432/kiarakraft_test',
      'test'
    ),
    /Refusing/
  );
});

test('provisioning never marks a pre-existing unmarked database', async () => {
  const queries = [];
  const client = {
    query: async sql => {
      queries.push(sql);
      if (sql.startsWith('SELECT current_database'))
        return { rows: [{ name: 'kiarakraft_test' }] };
      if (sql.startsWith('SELECT to_regclass'))
        return { rows: [{ marker: null }] };
      return { rowCount: 1 };
    },
  };
  await assert.rejects(
    verifyIdentity(client, 'test', { provision: true }),
    /unmarked database/
  );
  assert.ok(!queries.some(sql => /CREATE|INSERT/.test(sql)));
});

test('integration verification never provisions even an empty database', async () => {
  const client = {
    query: async sql => {
      if (sql.startsWith('SELECT current_database'))
        return { rows: [{ name: 'kiarakraft_test' }] };
      if (sql.startsWith('SELECT to_regclass'))
        return { rows: [{ marker: null }] };
      return { rowCount: 0 };
    },
  };
  await assert.rejects(verifyIdentity(client, 'test'), /unmarked database/);
});

test('marker must match the exact synthetic purpose and environment', async () => {
  const client = {
    query: async sql => {
      if (sql.startsWith('SELECT current_database'))
        return { rows: [{ name: 'kiarakraft_test' }] };
      if (sql.startsWith('SELECT to_regclass'))
        return { rows: [{ marker: 'kk_local_guard.identity' }] };
      return { rows: [{ purpose: 'production' }] };
    },
  };
  await assert.rejects(
    verifyIdentity(client, 'test'),
    /synthetic database marker/
  );
});
