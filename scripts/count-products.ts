import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.product.count();
  const active = await prisma.product.count({ where: { active: true } });
  const approvedVisible = await prisma.product.count({
    where: { active: true, eligibilityStatus: 'APPROVED' },
  });
  const pending = await prisma.product.count({
    where: { active: true, eligibilityStatus: 'PENDING' },
  });
  const rejected = await prisma.product.count({
    where: { active: true, eligibilityStatus: 'REJECTED' },
  });
  const inactive = total - active;
  console.log(
    JSON.stringify({
      total,
      active,
      approvedVisible,
      pending,
      rejected,
      inactive,
    })
  );
}

main().finally(() => prisma.$disconnect());
