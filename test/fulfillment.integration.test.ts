import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import '../scripts/dev/guard-test.mjs';
import { withCSRF } from '../lib/csrf';
import * as fulfillment from '../lib/fulfillment';
import * as jsonInput from '../lib/json-input';
import * as orderStatus from '../lib/orderStatus';
import { prisma } from '../lib/prisma';
import { loadRoute } from './helpers/load-route';

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

async function run() {
  const suffix = randomUUID();
  const orders: string[] = [];
  let userId: string | undefined;
  let addressId: string | undefined;
  let sellerId: string | undefined;
  try {
    const user = await prisma.user.create({
      data: {
        email: `fulfillment-${suffix}@example.invalid`,
        password: 'synthetic-only',
        role: 'SELLER',
        sellerProfile: {
          create: {
            shopName: 'Synthetic fulfillment shop',
            displayName: 'Synthetic fulfillment seller',
            handle: `fulfillment-${suffix}`,
          },
        },
      },
      include: { sellerProfile: true },
    });
    assert.ok(user.sellerProfile);
    userId = user.id;
    sellerId = user.sellerProfile.id;
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
    const product = await prisma.product.create({
      data: {
        sellerId,
        title: 'Synthetic fulfillment fixture',
        slug: `fulfillment-${suffix}`,
        description: 'Synthetic fixture',
        priceToman: 1000,
        stock: 1,
      },
    });
    const createOrder = async (
      status: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED'
    ) => {
      const order = await prisma.order.create({
        data: {
          userId: user.id,
          addressId: address.id,
          totalToman: 1000,
          status,
          items: {
            create: {
              productId: product.id,
              unitPriceToman: 1000,
              quantity: 1,
            },
          },
          payment: {
            create: {
              gateway: 'OFFLINE',
              status: status === 'PENDING' ? 'INITIATED' : 'PAID',
              amountToman: 1000,
            },
          },
          shipping: { create: { method: 'PICKUP', priceToman: 0 } },
        },
        include: { items: true, payment: true, shipping: true },
      });
      orders.push(order.id);
      assert.ok(order.shipping);
      return { ...order, shipping: order.shipping };
    };
    const getOrder = (id: string) =>
      prisma.order.findUniqueOrThrow({
        where: { id },
        include: { shipping: true, payment: true },
      });
    const getShipping = (id: string) =>
      prisma.orderShipping.findUniqueOrThrow({ where: { id } });

    let role = 'ADMIN';
    const notifications: [string, string, string | null | undefined][] = [];
    const dependencies = {
      'next/server': { NextResponse },
      '@/lib/auth': {
        auth: async () => ({ user: { id: user.id, email: user.email, role } }),
      },
      '@/lib/prisma': { prisma },
      '@/lib/csrf': { withCSRF },
      '@/lib/json-input': jsonInput,
      '@/lib/fulfillment': fulfillment,
      '@/lib/orderStatus': orderStatus,
      '@/lib/notifications': {
        sendFulfillmentNotification: (
          order: { id: string; userId: string },
          status: string,
          trackingNo?: string | null
        ) => {
          assert.equal(order.userId, user.id);
          notifications.push([order.id, status, trackingNo]);
        },
      },
      '@/lib/rateLimit': {
        adminRateLimit: {},
        sellerRateLimit: {},
        withRateLimit: (_config: unknown, handler: Handler) => handler,
      },
      '@prisma/client': {},
      '@sentry/nextjs': { setUser: () => {}, captureException: () => {} },
      zod: { z },
    };
    const shipping = loadRoute<{ PUT: Handler }>(
      'app/api/admin/shipping/[id]/route.ts',
      dependencies
    );
    const admin = loadRoute<{ PATCH: Handler }>(
      'app/api/admin/orders/[id]/status/route.ts',
      dependencies
    );
    const seller = loadRoute<{ PATCH: Handler }>(
      'app/api/seller/orders/[id]/status/route.ts',
      dependencies
    );
    const buyer = loadRoute<{ POST: Handler }>(
      'app/api/returns/route.ts',
      dependencies
    );
    const request = (
      handler: Handler,
      id: string,
      method: string,
      body: object,
      origin = 'http://127.0.0.1'
    ) =>
      handler(
        new NextRequest('http://127.0.0.1/api/synthetic-fulfillment', {
          method,
          headers: {
            'content-type': 'application/json',
            host: '127.0.0.1',
            origin,
          },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) }
      );
    const edit = (
      current: { id: string; updatedAt: Date },
      status: string,
      data: Record<string, string> = {}
    ) =>
      request(shipping.PUT, current.id, 'PUT', {
        status,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        ...data,
      });

    const pending = await createOrder('PENDING');
    assert.equal((await edit(pending.shipping, 'SHIPPED')).status, 409);
    assert.equal((await edit(pending.shipping, 'DELIVERED')).status, 409);
    assert.equal(
      (
        await request(shipping.PUT, pending.shipping.id, 'PUT', {
          status: 'SHIPPED',
        })
      ).status,
      400
    );
    assert.equal(
      (
        await request(
          shipping.PUT,
          pending.shipping.id,
          'PUT',
          {},
          'https://other.example.invalid'
        )
      ).status,
      403
    );
    role = 'SELLER';
    assert.equal((await edit(pending.shipping, 'PROCESSING')).status, 401);
    role = 'ADMIN';
    assert.equal((await getOrder(pending.id)).status, 'PENDING');
    assert.equal(notifications.length, 0);

    const order = await createOrder('PAID');
    assert.equal((await edit(order.shipping, 'DELIVERED')).status, 409);
    const saves = await Promise.all([
      edit(order.shipping, 'PROCESSING', { trackingNo: 'SYNTHETIC-A' }),
      edit(order.shipping, 'PROCESSING', { trackingNo: 'SYNTHETIC-B' }),
    ]);
    assert.deepEqual(saves.map(result => result.status).sort(), [200, 409]);
    let shipment = await getShipping(order.shipping.id);
    const history = shipment.history as { events: { trackingNo?: string }[] };
    assert.equal(history.events.length, 1);
    assert.equal(history.events[0].trackingNo, shipment.trackingNo);
    assert.equal(
      (await getOrder(order.id)).updatedAt.getTime(),
      order.updatedAt.getTime()
    );
    assert.equal(notifications.length, 0);

    assert.equal((await edit(shipment, 'SHIPPED')).status, 200);
    shipment = await getShipping(shipment.id);
    assert.equal(shipment.status, 'SHIPPED');
    assert.equal((await getOrder(order.id)).status, 'SHIPPED');
    assert.equal((await edit(shipment, 'DELIVERED')).status, 200);
    let delivered = await getOrder(order.id);
    assert.equal(delivered.status, 'DELIVERED');
    assert.equal(delivered.shipping?.status, 'DELIVERED');
    assert.deepEqual(delivered.payment, order.payment);
    assert.deepEqual(notifications, [
      [order.id, 'SHIPPED', shipment.trackingNo],
      [order.id, 'DELIVERED', shipment.trackingNo],
    ]);

    role = 'BUYER';
    const returned = await request(buyer.POST, order.id, 'POST', {
      orderId: order.id,
      orderItemId: order.items[0].id,
      reason: 'A synthetic return request',
    });
    assert.equal(
      returned.status,
      201,
      'Admin shipping delivery must enable buyer returns'
    );
    role = 'ADMIN';
    assert.ok(delivered.shipping);
    assert.equal(
      (
        await edit(delivered.shipping, 'DELIVERED', {
          trackingNo: 'SYNTHETIC-NEW',
        })
      ).status,
      200
    );
    assert.equal(
      (
        await edit(delivered.shipping, 'DELIVERED', {
          trackingNo: 'SYNTHETIC-OLD',
        })
      ).status,
      409
    );
    assert.equal(
      (
        await edit(await getShipping(delivered.shipping.id), 'DELIVERED', {
          trackingNo: 'SYNTHETIC-NEW',
        })
      ).status,
      200
    );
    const afterTracking = await getOrder(order.id);
    assert.equal(
      afterTracking.updatedAt.getTime(),
      delivered.updatedAt.getTime()
    );
    assert.equal(afterTracking.shipping?.trackingNo, 'SYNTHETIC-NEW');
    assert.ok(afterTracking.shipping);
    assert.equal((await edit(afterTracking.shipping, 'SHIPPED')).status, 409);
    assert.equal((await edit(afterTracking.shipping, 'RETURNED')).status, 200);
    delivered = await getOrder(order.id);
    assert.equal(delivered.shipping?.status, 'RETURNED');
    assert.equal(delivered.status, 'DELIVERED');
    assert.equal(
      delivered.updatedAt.getTime(),
      afterTracking.updatedAt.getTime()
    );
    assert.deepEqual(delivered.payment, order.payment);
    assert.equal(notifications.length, 2);

    const crossRoute = await createOrder('PAID');
    const race = await Promise.all([
      request(admin.PATCH, crossRoute.id, 'PATCH', { action: 'mark_shipped' }),
      edit(crossRoute.shipping, 'SHIPPED'),
    ]);
    assert.equal(race.filter(result => result.status === 200).length, 1);
    assert.ok(race.every(result => [200, 409, 400].includes(result.status)));
    const shipped = await getOrder(crossRoute.id);
    assert.equal(shipped.status, 'SHIPPED');
    assert.equal(shipped.shipping?.status, 'SHIPPED');
    assert.equal(
      notifications.filter(([id]) => id === crossRoute.id).length,
      1
    );
    role = 'SELLER';
    assert.equal(
      (
        await request(seller.PATCH, crossRoute.id, 'PATCH', {
          action: 'mark_delivered',
        })
      ).status,
      200
    );
    const sellerDelivered = await getOrder(crossRoute.id);
    assert.equal(sellerDelivered.status, 'DELIVERED');
    assert.equal(sellerDelivered.shipping?.status, 'DELIVERED');
    role = 'ADMIN';

    const legacyDelivered = await createOrder('DELIVERED');
    const knownDeliveryDate = new Date(Date.now() - 2 * 86_400_000);
    await prisma.order.update({
      where: { id: legacyDelivered.id },
      data: { updatedAt: knownDeliveryDate },
    });
    assert.equal(
      (await edit(legacyDelivered.shipping, 'DELIVERED')).status,
      200
    );
    const caughtUp = await getOrder(legacyDelivered.id);
    assert.equal(caughtUp.shipping?.status, 'DELIVERED');
    assert.equal(caughtUp.updatedAt.getTime(), knownDeliveryDate.getTime());
    assert.equal(
      notifications.filter(([id]) => id === legacyDelivered.id).length,
      0
    );

    const ahead = await createOrder('SHIPPED');
    await prisma.orderShipping.update({
      where: { id: ahead.shipping.id },
      data: { status: 'DELIVERED' },
    });
    assert.equal(
      (
        await request(admin.PATCH, ahead.id, 'PATCH', {
          action: 'mark_delivered',
        })
      ).status,
      409
    );
    const stillAhead = await getOrder(ahead.id);
    assert.equal(stillAhead.updatedAt.getTime(), ahead.updatedAt.getTime());
    assert.equal(stillAhead.status, 'SHIPPED');
    assert.equal(stillAhead.shipping?.status, 'DELIVERED');

    const legacyHistory = await createOrder('PAID');
    const unknown = await prisma.orderShipping.update({
      where: { id: legacyHistory.shipping.id },
      data: { history: { events: 'legacy value' } },
    });
    assert.equal((await edit(unknown, 'SHIPPED')).status, 409);
    assert.equal(
      (await getOrder(legacyHistory.id)).status,
      'PAID',
      'Failed shipment write rolls back the order'
    );
    assert.deepEqual(await getShipping(unknown.id), unknown);
    assert.equal(
      notifications.filter(([id]) => id === legacyHistory.id).length,
      0
    );

    assert.equal(
      (await request(admin.PATCH, pending.id, 'PATCH', { action: 'cancel' }))
        .status,
      200
    );
    assert.equal((await edit(pending.shipping, 'SHIPPED')).status, 409);
    assert.equal((await getOrder(pending.id)).status, 'CANCELED');
    assert.equal((await getShipping(pending.shipping.id)).status, 'PROCESSING');
    console.log(
      '✓ PostgreSQL fulfillment, tracking, authorization, rollback and buyer-return regressions passed'
    );
  } finally {
    const where = { orderId: { in: orders } };
    await prisma.returnRequest.deleteMany({ where });
    await prisma.orderShipping.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.payment.deleteMany({ where });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
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
