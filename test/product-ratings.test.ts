import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { ProductRating } from '../components/products/ProductRating';
import { getApprovedProductRatings } from '../lib/product-ratings';
import en from '../locales/en.json';
import fa from '../locales/fa.json';

type ReviewReader = Parameters<typeof getApprovedProductRatings>[0];
type Review = { productId: string; status: string; rating: number };

function reviewReader(rows: Review[]) {
  let calls = 0;
  const groupBy = async ({
    by,
    where,
    _avg,
    _count,
  }: {
    by: string[];
    where: { productId: { in: string[] }; status: string };
    _avg: { rating: boolean };
    _count: { rating: boolean };
  }) => {
    calls++;
    assert.deepEqual(by, ['productId']);
    assert.deepEqual(_avg, { rating: true });
    assert.deepEqual(_count, { rating: true });
    const approved = rows.filter(
      row =>
        where.productId.in.includes(row.productId) &&
        row.status === where.status
    );

    return [...new Set(approved.map(row => row.productId))].map(productId => {
      const ratings = approved.filter(row => row.productId === productId);
      return {
        productId,
        _avg: {
          rating:
            ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length,
        },
        _count: { rating: ratings.length },
      };
    });
  };
  return {
    reader: { groupBy } as unknown as ReviewReader,
    calls: () => calls,
  };
}

async function main() {
  const empty = reviewReader([]);
  assert.deepEqual(
    await getApprovedProductRatings(empty.reader, []),
    new Map()
  );
  assert.equal(empty.calls(), 0);
  assert.deepEqual(
    await getApprovedProductRatings(empty.reader, ['a']),
    new Map()
  );

  const unapproved: Review[] = [
    { productId: 'a', status: 'PENDING', rating: 5 },
    { productId: 'a', status: 'REJECTED', rating: 1 },
  ];
  assert.deepEqual(
    await getApprovedProductRatings(reviewReader(unapproved).reader, ['a']),
    new Map()
  );

  const mixed = reviewReader([
    ...unapproved,
    { productId: 'a', status: 'APPROVED', rating: 5 },
    { productId: 'a', status: 'APPROVED', rating: 3 },
    { productId: 'a', status: 'APPROVED', rating: 5 },
    { productId: 'b', status: 'APPROVED', rating: 2 },
    { productId: 'c', status: 'REJECTED', rating: 5 },
    { productId: 'd', status: 'APPROVED', rating: 5 },
  ]);
  const summaries = await getApprovedProductRatings(mixed.reader, [
    'a',
    'b',
    'c',
  ]);
  assert.deepEqual(
    summaries,
    new Map([
      ['a', { average: 13 / 3, count: 3 }],
      ['b', { average: 2, count: 1 }],
    ])
  );
  assert.equal(mixed.calls(), 1);

  for (const [locale, messages, expected] of [
    ['en', en, ['4.3 out of 5 · 3 reviews', '2.0 out of 5 · 1 review']],
    ['fa', fa, ['۴٫۳ از ۵ · ۳ نظر', '۲٫۰ از ۵ · ۱ نظر']],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages,
        timeZone: 'UTC',
        children: [...summaries].map(([id, rating]) =>
          createElement(ProductRating, { key: id, rating })
        ),
      })
    );
    for (const summary of expected) assert.ok(html.includes(summary));
  }

  console.log(
    'Approved product rating aggregation and English/Persian rendering passed'
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
