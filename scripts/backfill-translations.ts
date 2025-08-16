import { prisma } from '@/lib/prisma';
import { translateProductFields } from '@/lib/translator';

async function run() {
  const products = await prisma.product.findMany({ select: { id: true, title: true, description: true } });
  for (const p of products) {
    const needs = /[\u0600-\u06FF]/.test(p.title) || /[\u0600-\u06FF]/.test(p.description);
    if (!needs) continue;
    const existing: any = await (prisma as any).productTranslation.findUnique({
      where: { productId_locale: { productId: p.id, locale: 'en' } }
    }).catch(() => null);
    if (existing) continue;
    const en = await translateProductFields({ title: p.title, description: p.description }, 'fa', 'en');
    await (prisma as any).productTranslation.upsert({
      where: { productId_locale: { productId: p.id, locale: 'en' } },
      create: { productId: p.id, locale: 'en', title: en.title, description: en.description },
      update: { title: en.title, description: en.description }
    });
    console.log('Translated', p.id);
  }
  console.log('Done');
}

run().catch((e) => { console.error(e); process.exit(1); });
