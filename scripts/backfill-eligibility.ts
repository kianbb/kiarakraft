import { prisma } from '@/lib/prisma';
import { assessProductForHandcrafted } from '@/lib/moderation';

async function main() {
  console.log('Backfilling handcrafted eligibility...');
  const client: any = prisma as any;
  const products: any[] = await client.product.findMany({
    include: { category: { select: { slug: true } } }
  });

  let updated = 0;
  for (const p of products) {
    if (p.eligibilityStatus && p.eligibilityStatus !== 'PENDING') continue;
    const res = await assessProductForHandcrafted({
      title: p.title,
      description: p.description,
      categorySlug: p.category?.slug
    });
    await client.product.update({
      where: { id: p.id },
      data: {
        eligibilityStatus: res.status,
        eligibilityConfidence: res.confidence ?? null,
        eligibilityReasons: res.reasons?.join('; ').slice(0, 1000) || null
      }
    });
    updated++;
    if (updated % 10 === 0) console.log(`Updated ${updated}/${products.length}`);
  }

  console.log(`Done. Updated ${updated} products.`);
}

main().finally(async () => {
  await prisma.$disconnect();
});
