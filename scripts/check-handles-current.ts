import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking current handle status...');

  // Check if handles are populated
  const sellers = await prisma.sellerProfile.findMany({
    select: { id: true, handle: true, shopName: true, updatedAt: true },
  });

  console.log(`Total sellers: ${sellers.length}`);

  const withHandles = sellers.filter(s => s.handle);
  const withoutHandles = sellers.filter(s => !s.handle);

  console.log(`With handles: ${withHandles.length}`);
  console.log(`Without handles: ${withoutHandles.length}`);

  if (withHandles.length > 0) {
    console.log('\nSample handles:');
    withHandles.slice(0, 5).forEach(s => {
      console.log(
        `  ${s.id.substring(0, 8)}... "${s.shopName}" → "${s.handle}"`
      );
    });
  }

  // Check for duplicates
  const handles = withHandles.map(s => s.handle).filter(Boolean);
  const duplicates = handles.filter(
    (item, index) => handles.indexOf(item) !== index
  );
  if (duplicates.length > 0) {
    console.log('\nDUPLICATE HANDLES FOUND:', duplicates);
  }

  // Check constraints
  try {
    const constraints = await prisma.$queryRaw`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'SellerProfile' AND constraint_name LIKE '%handle%'
    `;
    console.log('\nHandle constraints:');
    console.log(constraints);
  } catch (error) {
    console.log('Error checking constraints:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
