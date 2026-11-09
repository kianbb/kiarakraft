import assert from 'node:assert/strict';
import { collectPreflightIssues } from '../lib/orderPreflight';
import { decrementOrderableStock } from '../lib/orderStock';

async function run() {
  const approved = {
    title: 'Synthetic craft',
    stock: 5,
    active: true,
    isTest: false,
    eligibilityStatus: 'APPROVED',
  };
  for (const product of [
    { ...approved, active: false },
    { ...approved, isTest: true },
    { ...approved, eligibilityStatus: 'PENDING' },
    { ...approved, eligibilityStatus: 'REJECTED' },
  ]) {
    const issues = collectPreflightIssues([
      { productId: 'p1', quantity: 1, product },
    ]);
    assert.equal(
      issues.length,
      1,
      'Unavailable product must block payment preflight'
    );
    assert.equal(issues[0].reason, 'inactive');
  }
  assert.equal(
    collectPreflightIssues([
      { productId: 'p1', quantity: 1, product: approved },
    ]).length,
    0
  );

  const writes: unknown[] = [];
  const successful = {
    product: {
      updateMany: async (query: unknown) => {
        writes.push(query);
        return { count: 1 };
      },
    },
  };
  await decrementOrderableStock(successful, [{ productId: 'p1', quantity: 2 }]);
  assert.deepEqual(writes, [
    {
      where: {
        active: true,
        isTest: false,
        eligibilityStatus: 'APPROVED',
        id: 'p1',
        stock: { gte: 2 },
      },
      data: { stock: { decrement: 2 } },
    },
  ]);

  // An eligibility change after preflight results in zero matching rows at the
  // conditional write. The helper must fail the surrounding payment transaction.
  let attempts = 0;
  await assert.rejects(
    decrementOrderableStock(
      {
        product: {
          updateMany: async () => {
            attempts++;
            return { count: 0 };
          },
        },
      },
      [
        { productId: 'revoked', quantity: 1 },
        { productId: 'p2', quantity: 1 },
      ]
    ),
    /Product unavailable/
  );
  assert.equal(
    attempts,
    1,
    'Capture must stop when a product becomes unavailable'
  );
  console.log(
    '✓ payment preflight and atomic orderability guard regressions passed'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
