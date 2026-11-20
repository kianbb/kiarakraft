import assert from 'node:assert/strict';

// This test validates the shape of the 409 payload from payments/create preflight branch
// by calling the preflight helper directly with a mocked transaction, avoiding DB deps.
import { cancelOrderAndRestoreCart, MinimalTx } from '../lib/paymentsPreflight';

async function run() {
  const calls: string[] = [];
  let orderStatus = 'PENDING';
  const mockTx: MinimalTx = {
    order: {
      updateMany: async args => {
        calls.push('order.updateMany');
        assert.deepEqual(args.where, {
          id: 'order-1',
          userId: 'user-1',
          status: 'PENDING',
        });
        if (orderStatus !== args.where.status) return { count: 0 };
        orderStatus = args.data.status;
        return { count: 1 };
      },
    },
    cart: {
      upsert: async () => {
        calls.push('cart.upsert');
        return { id: 'cart-1' };
      },
    },
    cartItem: {
      upsert: async () => {
        calls.push('cartItem.upsert');
        return {};
      },
    },
  };

  const flags = await cancelOrderAndRestoreCart(mockTx, 'user-1', 'order-1', [
    { productId: 'p1', quantity: 2 },
    { productId: 'p2', quantity: 1 },
  ]);

  assert.equal(flags.orderCanceled, true, 'orderCanceled flag should be true');
  assert.equal(flags.cartRestored, true, 'cartRestored flag should be true');

  // Basic call shape assertions
  assert.equal(orderStatus, 'CANCELED');
  const upserts = calls.filter(name => name === 'cartItem.upsert');
  assert.equal(upserts.length, 2, 'should upsert two cart items');

  for (const state of ['CANCELED', 'PAID']) {
    orderStatus = state;
    calls.length = 0;
    const result = await cancelOrderAndRestoreCart(
      mockTx,
      'user-1',
      'order-1',
      [{ productId: 'p1', quantity: 2 }]
    );
    assert.deepEqual(result, { orderCanceled: false, cartRestored: false });
    assert.equal(orderStatus, state);
    assert.deepEqual(calls, ['order.updateMany']);
  }

  console.log(
    '✓ Payment preflight leaves already processed orders and carts alone'
  );
}

run();
