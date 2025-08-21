import { searchProducts } from '../lib/search';
import { prisma } from '../lib/prisma';

async function run(term: string) {
  const res = await searchProducts({
    query: term,
    limit: 5,
    sortBy: 'relevance',
  });
  const items = res.products.map((p, i) => ({
    rank: i + 1,
    title: p.title,
    slug: p.slug,
    sellerVerified: p.seller.verified,
    relevance: (p as any)._relevance ?? null,
  }));
  // eslint-disable-next-line no-console
  console.log(`\nQuery: ${term}`);
  // eslint-disable-next-line no-console
  console.table(items);
}

(async () => {
  try {
    await run('carpet');
    await run('قالی');
  } catch (err) {
    console.error('Search smoke failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
