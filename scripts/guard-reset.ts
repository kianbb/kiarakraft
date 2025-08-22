// Simple safety guard to prevent accidental destructive resets in shared / prod DBs.
// Usage: set ALLOW_DB_RESET=true to bypass.
// This runs before `prisma migrate reset` in the npm script.

const allowed = process.env.ALLOW_DB_RESET === 'true';
const env = process.env.NODE_ENV || 'development';

if (!allowed) {
  console.error('\n❌ Blocked: Database reset aborted.');
  console.error(
    'Set ALLOW_DB_RESET=true if you really intend to drop and recreate all data.'
  );
  console.error(`NODE_ENV=${env}`);
  console.error('Example: ALLOW_DB_RESET=true npm run db:reset');
  process.exit(1);
} else {
  console.log('⚠️  Proceeding with destructive reset (ALLOW_DB_RESET=true).');
}
