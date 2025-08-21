import assert from 'node:assert/strict';
import {
  nextStatusForSeller,
  nextStatusForAdmin,
  type OrderStatus,
} from '../lib/orderStatus';

function testSellerRules() {
  console.log('Testing seller order status transitions...');

  // Single-seller order
  assert.equal(nextStatusForSeller('PAID', 'mark_shipped', true), 'SHIPPED');
  assert.equal(
    nextStatusForSeller('SHIPPED', 'mark_delivered', true),
    'DELIVERED'
  );
  assert.equal(nextStatusForSeller('PENDING', 'mark_shipped', true), undefined);
  assert.equal(nextStatusForSeller('PAID', 'mark_delivered', true), undefined);
  assert.equal(
    nextStatusForSeller('DELIVERED', 'mark_delivered', true),
    undefined
  );

  // Multi-seller order not allowed
  assert.equal(nextStatusForSeller('PAID', 'mark_shipped', false), undefined);

  console.log('✓ Seller rules pass');
}

function testAdminRules() {
  console.log('Testing admin order status transitions...');

  assert.equal(nextStatusForAdmin('PAID', 'mark_shipped'), 'SHIPPED');
  assert.equal(nextStatusForAdmin('SHIPPED', 'mark_delivered'), 'DELIVERED');

  // Cancel allowed only for PENDING or PAID
  assert.equal(nextStatusForAdmin('PENDING', 'cancel'), 'CANCELED');
  assert.equal(nextStatusForAdmin('PAID', 'cancel'), 'CANCELED');
  assert.equal(nextStatusForAdmin('SHIPPED', 'cancel'), undefined);
  assert.equal(nextStatusForAdmin('DELIVERED', 'cancel'), undefined);

  // Invalid transitions
  const invalid: Array<[OrderStatus, any]> = [
    ['PENDING', 'mark_shipped'],
    ['PENDING', 'mark_delivered'],
    ['PAID', 'mark_delivered'],
    ['DELIVERED', 'mark_delivered'],
  ];
  for (const [status, action] of invalid) {
    assert.equal(nextStatusForAdmin(status, action), undefined);
  }

  console.log('✓ Admin rules pass');
}

async function run() {
  try {
    testSellerRules();
    testAdminRules();
    console.log('🎉 Order status helper tests passed');
  } catch (err) {
    console.error('❌ Order status helper tests failed:', err);
    process.exit(1);
  }
}

run();
