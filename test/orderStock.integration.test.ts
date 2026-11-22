import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import '../scripts/dev/guard-test.mjs';
import * as jsonInput from '../lib/json-input';
import { prisma } from '../lib/prisma';
import { decrementOrderableStock } from '../lib/orderStock';
import {
  claimOfflinePaymentOrder,
  OfflinePaymentOrderConflict,
} from '../lib/offline-payment-order';
import { loadRoute } from './helpers/load-route';

type ReturnHandler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => Promise<NextResponse>;
type ReturnTransaction = Pick<Prisma.TransactionClient, 'returnRequest'> & {
  notificationLog: Pick<Prisma.TransactionClient['notificationLog'], 'create'>;
};

async function checkReturnTransitions(
  userId: string,
  orderId: string,
  productId: string
) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'DELIVERED' },
  });
  const payment = await prisma.payment.create({
    data: { orderId, amountToman: 1000, gateway: 'OFFLINE', status: 'PAID' },
  });
  const item = await prisma.orderItem.create({
    data: { orderId, productId, unitPriceToman: 1000, quantity: 1 },
  });
  const fixture = await prisma.returnRequest.create({
    data: { userId, orderId, orderItemId: item.id },
  });
  let role = 'ADMIN';
  let failNotification = false;
  let race: { arrivals: number; ready: PromiseWithResolvers<void> } | undefined;
  const { PATCH } = loadRoute<{ PATCH: ReturnHandler }>(
    'app/api/admin/returns/[id]/status/route.ts',
    {
      'next/server': { NextResponse },
      zod: { z },
      '@/lib/auth': { auth: async () => ({ user: { id: userId, role } }) },
      '@/lib/csrf': { withCSRF: (handler: ReturnHandler) => handler },
      '@/lib/json-input': jsonInput,
      '@/lib/prisma': {
        prisma: {
          returnRequest: prisma.returnRequest,
          notificationLog: prisma.notificationLog,
          payment: prisma.payment,
          product: prisma.product,
          $transaction: async <T>(
            operation: (tx: ReturnTransaction) => Promise<T>
          ) => {
            // The route only enters here after reading the observed state.
            // Force both requests to observe that state before either writes.
            if (race) {
              if (++race.arrivals === 2) race.ready.resolve();
              await race.ready.promise;
            }
            return prisma.$transaction(tx =>
              operation({
                returnRequest: tx.returnRequest,
                notificationLog: failNotification
                  ? {
                      create: () => {
                        throw new Error('Synthetic notification failure');
                      },
                    }
                  : tx.notificationLog,
              })
            );
          },
        },
      },
    },
    { env: { RESTOCK_ON_REFUND: 'true' } }
  );
  const getStatus = async () =>
    (
      await prisma.returnRequest.findUniqueOrThrow({
        where: { id: fixture.id },
      })
    ).status;
  const getNotifications = () =>
    prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
      select: { type: true, status: true, data: true },
    });
  const patch = (
    status: string,
    expectedStatus = 'REQUESTED',
    id = fixture.id
  ) =>
    PATCH(
      new NextRequest('http://127.0.0.1/api/admin/returns/synthetic/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status,
          ...(expectedStatus ? { expectedStatus } : {}),
        }),
      }),
      { params: Promise.resolve({ id }) }
    );

  role = 'SELLER';
  assert.equal((await patch('APPROVED')).status, 401);
  role = 'ADMIN';
  assert.equal((await patch('OPEN')).status, 400);
  assert.equal((await patch('APPROVED', '')).status, 400);
  assert.equal(
    (await patch('APPROVED', 'REQUESTED', `missing-${fixture.id}`)).status,
    404
  );
  assert.equal((await patch('RECEIVED')).status, 400);
  assert.equal(await getStatus(), 'REQUESTED');
  assert.deepEqual(await getNotifications(), []);

  failNotification = true;
  assert.equal((await patch('APPROVED')).status, 500);
  failNotification = false;
  assert.equal(
    await getStatus(),
    'REQUESTED',
    'Notification failure rolls back the transition'
  );
  assert.deepEqual(await getNotifications(), []);

  const ready = Promise.withResolvers<void>();
  const deadline = setTimeout(
    () => ready.reject(new Error('Return race did not reach both writes')),
    5000
  );
  race = { arrivals: 0, ready };
  try {
    const results = await Promise.all([patch('APPROVED'), patch('APPROVED')]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  } finally {
    clearTimeout(deadline);
    race = undefined;
  }
  assert.equal(await getStatus(), 'APPROVED');
  assert.deepEqual(
    (await getNotifications()).map(note => note.type),
    ['return_approved']
  );

  // Another admin's older intent cannot reject the newly approved return.
  assert.equal((await patch('REJECTED', 'REQUESTED')).status, 409);
  assert.equal(await getStatus(), 'APPROVED');
  assert.equal((await getNotifications()).length, 1);

  assert.equal((await patch('RECEIVED', 'APPROVED')).status, 200);
  assert.equal(await getStatus(), 'RECEIVED');
  const notifications = await getNotifications();
  assert.deepEqual(
    notifications.map(note => note.type),
    ['return_approved', 'return_received']
  );
  for (const note of notifications) {
    assert.equal(note.status, 'pending');
    assert.equal((note.data as Prisma.JsonObject).returnId, fixture.id);
  }

  const stock = async () =>
    (
      await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stock: true },
      })
    ).stock;
  const stockBefore = await stock();
  assert.equal((await patch('REFUNDED', '')).status, 409);
  assert.equal(await getStatus(), 'RECEIVED');
  assert.deepEqual(await getNotifications(), notifications);
  assert.equal(await stock(), stockBefore);
  assert.deepEqual(
    await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    payment
  );
}

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
    const stock = () =>
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      });
    const updateStock = (value: number) =>
      prisma.product.update({
        where: { id: product.id },
        data: { stock: value },
        select: { stock: true },
      });
    const [, committed] = await prisma.$transaction([updateStock(6), stock()]);
    assert.equal(committed.stock, 6);
    await assert.rejects(
      prisma.$transaction([
        updateStock(7),
        prisma.product.findUniqueOrThrow({
          where: { id: `missing-${suffix}` },
          select: { id: true },
        }),
      ]),
      { code: 'P2025' }
    );
    assert.equal((await stock()).stock, 6, 'A failed batch must roll back');
    assert.equal((await updateStock(5)).stock, 5);

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
      '✓ PostgreSQL batch and interactive rollback, stock contention, and offline order claims passed'
    );
    await checkReturnTransitions(userId, orderId, product.id);
    console.log(
      '✓ PostgreSQL return transitions, replay conflict, rollback, and refund denial passed'
    );
  } finally {
    if (userId) await prisma.notificationLog.deleteMany({ where: { userId } });
    if (orderId) {
      await prisma.returnRequest.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
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
