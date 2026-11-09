import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  ImageOrderError,
  reorderProductImages,
} from '../lib/product-image-order';

async function run() {
  const rows = [
    { id: 'own-a', productId: 'owned-product', sortOrder: 0 },
    { id: 'own-b', productId: 'owned-product', sortOrder: 1 },
    { id: 'other-image', productId: 'other-product', sortOrder: 0 },
  ];
  let writes = 0;
  const database = {
    async $transaction(callback: (tx: unknown) => Promise<void>) {
      const pending = rows.map(row => ({ ...row }));
      await callback({
        listingImage: {
          async findMany({
            where,
          }: {
            where: { productId: string; id: { in: string[] } };
          }) {
            return pending.filter(
              row =>
                row.productId === where.productId &&
                where.id.in.includes(row.id)
            );
          },
          async update({
            where,
            data,
          }: {
            where: { id: string; productId: string };
            data: { sortOrder: number };
          }) {
            assert.equal(
              where.productId,
              'owned-product',
              'every write must retain the ownership constraint'
            );
            const row = pending.find(
              item => item.id === where.id && item.productId === where.productId
            );
            assert.ok(row);
            row.sortOrder = data.sortOrder;
            writes++;
          },
        },
      });
      rows.splice(0, rows.length, ...pending);
    },
  } as unknown as Pick<PrismaClient, '$transaction'>;
  await assert.rejects(
    reorderProductImages(database, 'owned-product', [
      { id: 'own-a', sortOrder: 1 },
      { id: 'other-image', sortOrder: 0 },
    ]),
    (error: unknown) => error instanceof ImageOrderError && error.status === 404
  );
  assert.equal(writes, 0, 'mixed ownership must reject before any mutation');
  assert.deepEqual(
    rows.map(row => row.sortOrder),
    [0, 1, 0]
  );
  for (const invalid of [
    null,
    [],
    [{ id: 'own-a', sortOrder: -1 }],
    [{ id: 'own-a', sortOrder: 0.5 }],
    [
      { id: 'own-a', sortOrder: 0 },
      { id: 'own-a', sortOrder: 1 },
    ],
  ]) {
    await assert.rejects(
      reorderProductImages(database, 'owned-product', invalid),
      (error: unknown) =>
        error instanceof ImageOrderError && error.status === 400
    );
  }
  await reorderProductImages(database, 'owned-product', [
    { id: 'own-a', sortOrder: 1 },
    { id: 'own-b', sortOrder: 0 },
  ]);
  assert.deepEqual(
    rows.map(row => row.sortOrder),
    [1, 0, 0]
  );
  console.log(
    'Product image reorder ownership and atomic rejection tests passed'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
