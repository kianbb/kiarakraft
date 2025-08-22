import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up orphaned migration entries...');

  // Remove the bad migration entries from _prisma_migrations table
  await prisma.$executeRaw`
    DELETE FROM "_prisma_migrations" 
    WHERE "migration_name" = '20250822101500_add_seller_handle_banner'
  `;

  console.log('Cleaned up orphaned migration entries.');

  // Show current migration state
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, applied_steps_count 
    FROM "_prisma_migrations" 
    ORDER BY started_at DESC
  `;

  console.log('Current migrations in database:');
  console.log(migrations);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
