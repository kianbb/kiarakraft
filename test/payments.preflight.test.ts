import assert from 'node:assert/strict';

// This test validates the shape of the 409 payload from payments/create preflight branch
// by calling the preflight helper directly with a mocked transaction, avoiding DB deps.
import { cancelOrderAndRestoreCart, MinimalTx } from '../lib/paymentsPreflight';

async function run() {
  const calls: any[] = [];
  const mockTx: MinimalTx = {
    order: {
      update: async (args) => {
        calls.push(['order.update', args]);
        return {};
      },
    },
    cart: {
      upsert: async (args) => {
        calls.push(['cart.upsert', args]);
        return { id: 'cart-1' } as any;
      }
    },
    cartItem: {
      upsert: async (args) => {
        calls.push(['cartItem.upsert', args]);
        return {};
      }
    }
  };

  const flags = await cancelOrderAndRestoreCart(
    mockTx,
    'user-1',
    'order-1',
    [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ]
  );

  assert.equal(flags.orderCanceled, true, 'orderCanceled flag should be true');
  assert.equal(flags.cartRestored, true, 'cartRestored flag should be true');

  // Basic call shape assertions
  const hasOrderUpdate = calls.some(([name]) => name === 'order.update');
  assert.ok(hasOrderUpdate, 'should update order to CANCELED');
  const upserts = calls.filter(([name]) => name === 'cartItem.upsert');
  assert.equal(upserts.length, 2, 'should upsert two cart items');

  console.log('✓ payments preflight helper test passed');
}

run();
