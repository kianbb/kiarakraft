import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.product.updateMany({
    where: { active: true, eligibilityStatus: { in: ['PENDING', 'REVIEW'] } },
    data: { eligibilityStatus: 'APPROVED' },
  });
  console.log(JSON.stringify({ approved: updated.count }));
}

main().finally(() => prisma.$disconnect());
