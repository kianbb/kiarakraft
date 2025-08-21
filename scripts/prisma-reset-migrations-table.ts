import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id TEXT PRIMARY KEY,
        checksum TEXT,
        finished_at TIMESTAMP,
        migration_name TEXT,
        logs TEXT,
        rolled_back_at TIMESTAMP,
        started_at TIMESTAMP,
        applied_steps_count INTEGER
      );
    `);
    await client.query('TRUNCATE TABLE "_prisma_migrations"');
    await client.query('COMMIT');
    console.log('Cleared _prisma_migrations table successfully');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed to clear _prisma_migrations:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
