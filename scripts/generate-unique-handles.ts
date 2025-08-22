import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 20); // Limit length
}

async function main() {
  console.log('Generating unique handles for existing sellers...');

  const sellers = await prisma.sellerProfile.findMany({
    select: { id: true, shopName: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });

  const handleMap = new Map<string, number>();
  const updates: Array<{ id: string; handle: string }> = [];

  for (const seller of sellers) {
    // Create base handle from shopName or displayName
    const baseText = seller.shopName || seller.displayName;
    const baseHandle = slugify(baseText);

    // Ensure uniqueness with counter
    let finalHandle = baseHandle;
    const count = handleMap.get(baseHandle) || 0;
    if (count > 0) {
      finalHandle = `${baseHandle}-${count + 1}`;
    }
    handleMap.set(baseHandle, count + 1);

    updates.push({ id: seller.id, handle: finalHandle });
    console.log(
      `${seller.id.substring(0, 8)}... "${seller.shopName}" → "${finalHandle}"`
    );
  }

  console.log(`\nWould update ${updates.length} sellers with unique handles.`);
  console.log('This is a preview - no database changes made yet.');

  return updates;
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
