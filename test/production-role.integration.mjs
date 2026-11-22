import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { require as tsxRequire } from 'tsx/cjs/api';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  assertLocalDatabase,
  safeEnvironment,
} from '../scripts/dev/environment.mjs';
import {
  connectLocal,
  isolatedClient,
  localPrismaPoolOptions,
  verifyIdentity,
} from '../scripts/dev/database.mjs';
const { verifyProductionDatabaseIdentity } = tsxRequire(
  '../lib/production-database.ts',
  import.meta.url
);
const { guardPrismaDatabase } = tsxRequire(
  '../lib/staging-database.ts',
  import.meta.url
);

const grants = {
  SELECT: ['Category', 'FxRate'],
  'SELECT, INSERT': ['AIUsage', 'AuditLog', 'NotificationLog', 'OrderItem'],
  'SELECT, INSERT, DELETE': ['WishlistItem'],
  'SELECT, INSERT, UPDATE': [
    'Cart',
    'Order',
    'OrderShipping',
    'Payment',
    'ReturnRequest',
    'SellerDocument',
    'SellerProfile',
    'User',
  ],
  'SELECT, INSERT, UPDATE, DELETE': [
    'Address',
    'CartItem',
    'ListingImage',
    'PasswordResetToken',
    'Product',
    'ProductTranslation',
    'PushSubscription',
    'RateLimit',
    'Review',
  ],
};
const types = [
  'PaymentGateway',
  'PaymentStatus',
  'ReturnStatus',
  'ShippingMethod',
];
const searchFunctions = [
  'product_search_rank(text, text, text)',
  'similarity(text, text)',
  'unaccent(text)',
  'unaccent(regdictionary, text)',
];
const table = name => `public.${pg.escapeIdentifier(name)}`;

async function checkGrants(runtime) {
  let checked = 0;
  for (const [allowed, names] of Object.entries(grants)) {
    for (const name of names) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const result = await runtime.query(
          'SELECT has_table_privilege($1, $2) AS allowed',
          [table(name), privilege]
        );
        assert.equal(
          result.rows[0].allowed,
          allowed.split(', ').includes(privilege),
          `${name} ${privilege}`
        );
        checked++;
      }
    }
  }
  assert.equal(checked, 168);
}

async function verifyFixtureCommerce(runtime, id) {
  await runtime.query('BEGIN');
  try {
    const rank = await runtime.query(
      "SELECT public.product_search_rank('rug', 'wool', 'rug') IS NOT NULL AS works"
    );
    assert.equal(rank.rows[0].works, true);
    for (let count = 1; count <= 2; count++) {
      const result = await runtime.query(
        `INSERT INTO public."RateLimit" (id,identifier,count,"resetTime","updatedAt")
         VALUES ($1,$1,1,NOW(),NOW())
         ON CONFLICT (identifier) DO UPDATE SET count = "RateLimit".count + 1
         RETURNING count`,
        [id]
      );
      assert.equal(result.rows[0].count, count);
    }
    const order = await runtime.query(
      `INSERT INTO public."Order" (id,"userId","addressId",status,"totalToman","updatedAt")
       SELECT $1,"userId",id,'SHIPPED',260000,NOW()
       FROM public."Address" WHERE id='kk_local_address' AND "userId"='kk_local_buyer'`,
      [id]
    );
    assert.equal(order.rowCount, 1);
    await runtime.query(
      `INSERT INTO public."OrderItem" (id,"orderId","productId",quantity,"unitPriceToman")
       VALUES ($1,$1,'kk_local_bowl',1,250000)`,
      [id]
    );
    await runtime.query(
      `INSERT INTO public."Payment" (id,"orderId",gateway,status,"amountToman","updatedAt")
       VALUES ($1,$1,'OFFLINE','PAID',260000,NOW())`,
      [id]
    );
    await runtime.query(
      `INSERT INTO public."OrderShipping" (id,"orderId",method,"priceToman",status,"updatedAt")
       VALUES ($1,$1,'STANDARD',10000,'SHIPPED',NOW())`,
      [id]
    );
    await runtime.query(
      `UPDATE public."OrderShipping" SET status='DELIVERED' WHERE id=$1`,
      [id]
    );
    await runtime.query(
      `INSERT INTO public."ReturnRequest" (id,"orderId","orderItemId","userId","updatedAt")
       VALUES ($1,$1,$1,'kk_local_buyer',NOW())`,
      [id]
    );
    const returned = await runtime.query(
      `UPDATE public."ReturnRequest" SET status='RECEIVED' WHERE id=$1 RETURNING status`,
      [id]
    );
    assert.equal(returned.rows[0].status, 'RECEIVED');
    await runtime.query(
      `INSERT INTO public."NotificationLog" (id,type,channel,status)
       VALUES ($1,'return_received','email','pending')`,
      [id]
    );
    await runtime.query(
      'SELECT id FROM public."Order" WHERE id=$1 FOR UPDATE',
      [id]
    );
  } finally {
    await runtime.query('ROLLBACK');
  }
}

async function verifyGuardedPrisma(runtime, target, policy) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(localPrismaPoolOptions(target.href, 'test'), {
      schema: 'public',
    }),
  });
  try {
    const guarded = guardPrismaDatabase(prisma, () =>
      verifyProductionDatabaseIdentity(runtime, policy)
    );
    const [product, identity] = await guarded.$transaction(
      async transaction => [
        await transaction.product.findUnique({
          where: { id: 'kk_local_bowl' },
          select: { id: true },
        }),
        await transaction.$queryRaw`SELECT current_user::text AS role`,
      ]
    );
    assert.equal(product.id, 'kk_local_bowl');
    assert.deepEqual(identity, [{ role: policy.roleName }]);

    const refused = guardPrismaDatabase(prisma, () =>
      verifyProductionDatabaseIdentity(runtime, {
        ...policy,
        roleName: 'other_runtime',
      })
    );
    await assert.rejects(
      refused.product.count(),
      /identity or role permissions/
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const env = safeEnvironment({ kind: 'test', nodeEnv: 'test' });
  const target = assertLocalDatabase(env.DATABASE_URL, 'test');
  const owner = await connectLocal(env.DATABASE_URL, 'test');
  const roleName = `kk_release_${randomBytes(6).toString('hex')}`;
  const role = pg.escapeIdentifier(roleName);
  const password = randomBytes(24).toString('base64url');
  let created = false;
  let runtime;
  try {
    await verifyIdentity(owner, 'test');
    await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD ${pg.escapeLiteral(password)}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    created = true;
    await owner.query(`GRANT CONNECT ON DATABASE kiarakraft_test TO ${role}`);
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    for (const [privileges, names] of Object.entries(grants)) {
      await owner.query(
        `GRANT ${privileges} ON ${names.map(table).join(', ')} TO ${role}`
      );
    }
    await owner.query(
      `GRANT USAGE ON TYPE ${types.map(table).join(', ')} TO ${role}`
    );
    await owner.query(
      `GRANT EXECUTE ON FUNCTION ${searchFunctions.map(name => `public.${name}`).join(', ')} TO ${role}`
    );

    const runtimeTarget = new URL(target);
    runtimeTarget.username = roleName;
    runtimeTarget.password = password;
    runtime = isolatedClient(runtimeTarget);
    await runtime.connect();
    const policy = { databaseName: 'kiarakraft_test', roleName };
    await verifyProductionDatabaseIdentity(runtime, policy);
    await assert.rejects(
      verifyProductionDatabaseIdentity(runtime, {
        ...policy,
        roleName: 'other_runtime',
      })
    );
    await checkGrants(runtime);
    await verifyGuardedPrisma(runtime, runtimeTarget, policy);
    await verifyFixtureCommerce(runtime, roleName);
    for (const sql of [
      'SELECT id FROM public._prisma_migrations LIMIT 0',
      'DELETE FROM public."AuditLog" WHERE false',
      'UPDATE public."FxRate" SET rate = 1 WHERE false',
      `CREATE TABLE ${table(roleName)} (id text)`,
      `SET ROLE ${pg.escapeIdentifier(decodeURIComponent(target.username))}`,
    ]) {
      await assert.rejects(runtime.query(sql), { code: '42501' });
    }
    await owner.query(
      `GRANT SELECT (id) ON public._prisma_migrations TO ${role}`
    );
    try {
      await assert.rejects(verifyProductionDatabaseIdentity(runtime, policy));
    } finally {
      await owner.query(
        `REVOKE SELECT (id) ON public._prisma_migrations FROM ${role}`
      );
    }
    await verifyProductionDatabaseIdentity(runtime, policy);
    for (const name of [
      'Order',
      'OrderItem',
      'Payment',
      'OrderShipping',
      'ReturnRequest',
      'NotificationLog',
      'RateLimit',
    ]) {
      const result = await owner.query(
        `SELECT 1 FROM ${table(name)} WHERE id=$1`,
        [roleName]
      );
      assert.equal(result.rowCount, 0);
    }
  } finally {
    try {
      if (runtime) await runtime.end();
      if (created) {
        await owner.query(`DROP OWNED BY ${role}`);
        await owner.query(`DROP ROLE ${role}`);
      }
    } finally {
      await owner.end();
    }
  }
}

await main();
console.log(
  'Restricted login, 168 effective grants, guarded Prisma, checkout-to-return SQL, denials and rollback passed.'
);
