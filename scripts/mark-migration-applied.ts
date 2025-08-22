import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Marking migration as applied...');

  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations" (
      id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
    ) VALUES (
      gen_random_uuid(),
      '0',  -- checksum
      NOW(),
      '20250822110000_add_seller_handle_banner',
      '',
      NULL,
      NOW(),
      1
    )
  `;

  console.log('Migration marked as applied.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
