import { assertLocalDatabase } from './environment.mjs';

if (
  process.env.KK_ISOLATED !== '1' ||
  process.env.KK_TEST_DATABASE_VERIFIED !== '1'
) {
  throw new Error(
    'Use npm run test:integration; direct database test execution is blocked.'
  );
}
assertLocalDatabase(process.env.DATABASE_URL, 'test');
