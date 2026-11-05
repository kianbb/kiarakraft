import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import '../scripts/dev/guard-test.mjs';
import { prisma } from '../lib/prisma';
import { decrementOrderableStock } from '../lib/orderStock';

async function run() {
  const suffix = randomUUID();
  let userId: string | undefined;
  let sellerId: string | undefined;
  try {
    const user = await prisma.user.create({
      data: {
        email: `stock-${suffix}@example.invalid`,
        password: 'synthetic-only',
        role: 'SELLER',
        sellerProfile: {
          create: {
            shopName: 'Synthetic stock test',
            displayName: 'Synthetic seller',
            handle: `stock-${suffix}`,
          },
        },
      },
      include: { sellerProfile: true },
    });
    userId = user.id;
    sellerId = user.sellerProfile!.id;
    const product = await prisma.product.create({
      data: {
        sellerId,
        title: 'Synthetic stock test',
        slug: `stock-${suffix}`,
        description: 'Synthetic fixture. Not for sale.',
        priceToman: 1000,
        stock: 5,
        active: true,
        isTest: false,
        eligibilityStatus: 'APPROVED',
      },
    });
    const items = [{ productId: product.id, quantity: 1 }];

    for (const changes of [
      { active: false },
      { isTest: true },
      { eligibilityStatus: 'PENDING' },
      { eligibilityStatus: 'REJECTED' },
    ]) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          active: true,
          isTest: false,
          eligibilityStatus: 'APPROVED',
          ...changes,
        },
      });
      await assert.rejects(
        prisma.$transaction(tx => decrementOrderableStock(tx, items)),
        /Product unavailable/
      );
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .stock,
        5
      );
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { active: true, isTest: false, eligibilityStatus: 'APPROVED' },
    });
    await assert.rejects(
      prisma.$transaction(tx =>
        decrementOrderableStock(tx, [
          ...items,
          { productId: `missing-${suffix}`, quantity: 1 },
        ])
      ),
      /Product unavailable/
    );
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
        .stock,
      5,
      'A later unavailable item must roll back the earlier stock decrement'
    );

    await prisma.product.update({
      where: { id: product.id },
      data: { stock: 1 },
    });
    const results = await Promise.allSettled([
      prisma.$transaction(tx => decrementOrderableStock(tx, items)),
      prisma.$transaction(tx => decrementOrderableStock(tx, items)),
    ]);
    assert.equal(
      results.filter(result => result.status === 'fulfilled').length,
      1,
      'Only one capture may consume the last unit'
    );
    assert.equal(
      results.filter(result => result.status === 'rejected').length,
      1
    );
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
        .stock,
      0
    );
    console.log(
      '✓ PostgreSQL orderability, rollback, and stock contention regressions passed'
    );
  } finally {
    if (sellerId) {
      await prisma.product.deleteMany({ where: { sellerId } });
      await prisma.sellerProfile.delete({ where: { id: sellerId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
