import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Try to query with old schema fields only to see current database state
    console.log('Checking current database schema...');

    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'SellerProfile' 
      ORDER BY ordinal_position;
    `;

    console.log('SellerProfile columns in database:');
    console.log(result);
  } catch (error) {
    console.error('Error checking schema:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
