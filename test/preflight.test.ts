import assert from 'node:assert/strict';
import { collectPreflightIssues } from '../lib/orderPreflight';

function testCollectPreflightIssues() {
  const issues = collectPreflightIssues([
    {
      productId: 'p1',
      quantity: 3,
      product: {
        title: 'A',
        stock: 2,
        active: true,
        isTest: false,
        eligibilityStatus: 'APPROVED',
      },
    },
    {
      productId: 'p2',
      quantity: 1,
      product: {
        title: 'B',
        stock: 10,
        active: false,
        isTest: false,
        eligibilityStatus: 'APPROVED',
      },
    },
    {
      productId: 'p3',
      quantity: 1,
      product: {
        title: 'C',
        stock: 5,
        active: true,
        isTest: false,
        eligibilityStatus: 'APPROVED',
      },
    },
  ]);
  assert.equal(issues.length, 2);
  const reasons = issues.map(i => i.reason).sort();
  assert.deepEqual(reasons, ['inactive', 'insufficient_stock']);
}

async function run() {
  try {
    testCollectPreflightIssues();
    console.log('✓ preflight helper tests passed');
  } catch (err) {
    console.error('❌ preflight helper tests failed:', err);
    process.exit(1);
  }
}

run();
