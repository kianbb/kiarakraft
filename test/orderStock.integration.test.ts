import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import '../scripts/dev/guard-test.mjs';
import { prisma } from '../lib/prisma';
import { decrementOrderableStock } from '../lib/orderStock';
import {
  claimOfflinePaymentOrder,
  OfflinePaymentOrderConflict,
} from '../lib/offline-payment-order';

async function run() {
  const suffix = randomUUID();
  let userId: string | undefined;
  let sellerId: string | undefined;
  let addressId: string | undefined;
  let orderId: string | undefined;
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

    const address = await prisma.address.create({
      data: {
        userId,
        fullName: 'Synthetic fixture',
        phone: '0000000000',
        country: 'IR',
        province: 'Synthetic province',
        city: 'Synthetic city',
        line1: 'Synthetic address',
      },
    });
    addressId = address.id;
    const order = await prisma.order.create({
      data: { userId, addressId, totalToman: 1000, status: 'PENDING' },
    });
    orderId = order.id;
    const confirmation = { orderId, amountToman: order.totalToman };
    const getOrder = () =>
      prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const getProduct = () =>
      prisma.product.findUniqueOrThrow({ where: { id: product.id } });

    await assert.rejects(
      prisma.$transaction(tx =>
        claimOfflinePaymentOrder(tx, { ...confirmation, amountToman: 1001 })
      ),
      OfflinePaymentOrderConflict
    );
    await assert.rejects(
      prisma.$transaction(async tx => {
        await claimOfflinePaymentOrder(tx, confirmation);
        await decrementOrderableStock(tx, items);
      }),
      /Product unavailable/
    );
    assert.equal(
      (await getOrder()).status,
      'PENDING',
      'Stock failure must roll back the order claim'
    );
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: 2 },
    });

    const capture = () =>
      prisma.$transaction(async tx => {
        await claimOfflinePaymentOrder(tx, confirmation);
        await decrementOrderableStock(tx, items);
      });
    const captures = await Promise.allSettled([capture(), capture()]);
    assert.equal(
      captures.filter(result => result.status === 'fulfilled').length,
      1
    );
    const rejected = captures.find(result => result.status === 'rejected');
    assert.ok(rejected?.reason instanceof OfflinePaymentOrderConflict);
    assert.equal(
      (await getProduct()).stock,
      1,
      'Concurrent capture must decrement stock exactly once'
    );
    await assert.rejects(
      prisma.order.update({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'CANCELED' },
      }),
      { code: 'P2025' }
    );
    assert.equal(
      (await getOrder()).status,
      'PAID',
      'Stale cancellation must not overwrite capture'
    );

    // Keep the existing allowed PAID-to-CANCELED transition. Once canceled,
    // the order cannot be claimed by a later capture.
    await prisma.order.update({
      where: { id: orderId, status: 'PAID' },
      data: { status: 'CANCELED' },
    });
    await assert.rejects(capture(), OfflinePaymentOrderConflict);
    assert.equal(
      (await getProduct()).stock,
      1,
      'Late capture of a canceled order must leave stock intact'
    );
    console.log(
      '✓ PostgreSQL orderability, rollback, stock contention, and offline order claims passed'
    );
  } finally {
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (addressId) await prisma.address.delete({ where: { id: addressId } });
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
