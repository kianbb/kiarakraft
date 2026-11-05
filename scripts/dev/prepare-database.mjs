import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { localDir, safeEnvironment } from './environment.mjs';
import { connectLocal, verifyIdentity } from './database.mjs';
import { nodeTool } from './run.mjs';

export async function prepareDatabase(kind = 'test') {
  const env = safeEnvironment({ kind, nodeEnv: 'test' });
  const client = await connectLocal(env.DATABASE_URL, kind);
  try {
    await verifyIdentity(client, kind, { provision: true });
  } finally {
    await client.end();
  }
  await nodeTool('prisma/build/index.js', ['migrate', 'deploy'], env);

  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const credentialsPath = path.join(localDir, 'credentials.json');
  const credentials = existsSync(credentialsPath)
    ? JSON.parse(readFileSync(credentialsPath, 'utf8'))
    : { password: randomBytes(18).toString('base64url') + 'Aa1!' };
  writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2) + '\n', {
    mode: 0o600,
  });
  chmodSync(credentialsPath, 0o600);
  const hash = await bcrypt.hash(credentials.password, 12);
  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });
  try {
    await prisma.$transaction(async tx => {
      for (const role of ['BUYER', 'SELLER', 'ADMIN']) {
        const slug = role.toLowerCase();
        await tx.user.upsert({
          where: { email: `${slug}@kiarakraft.invalid` },
          create: {
            id: `kk_local_${slug}`,
            email: `${slug}@kiarakraft.invalid`,
            name: `Synthetic ${role}`,
            role,
            password: hash,
          },
          update: {
            password: hash,
            ...(kind === 'test' ? { role, name: `Synthetic ${role}` } : {}),
          },
        });
      }
      const seller = await tx.sellerProfile.upsert({
        where: { userId: 'kk_local_seller' },
        create: {
          id: 'kk_local_shop',
          userId: 'kk_local_seller',
          handle: 'synthetic-studio',
          shopName: 'Synthetic Studio',
          displayName: 'Synthetic Artisan',
          verified: true,
        },
        update:
          kind === 'test'
            ? {
                verified: true,
                shopName: 'Synthetic Studio',
                displayName: 'Synthetic Artisan',
              }
            : {},
      });
      const category = await tx.category.upsert({
        where: { slug: 'ceramics' },
        create: { id: 'kk_local_ceramics', slug: 'ceramics', name: 'Ceramics' },
        update: kind === 'test' ? { name: 'Ceramics' } : {},
      });
      const product = await tx.product.upsert({
        where: { slug: 'synthetic-ceramic-bowl' },
        create: {
          id: 'kk_local_bowl',
          sellerId: seller.id,
          categoryId: category.id,
          title: 'کاسه سفالی نمونه',
          slug: 'synthetic-ceramic-bowl',
          description: 'محصول آزمایشی دست‌ساز؛ قابل خرید واقعی نیست.',
          priceToman: 100000,
          stock: 10,
          active: true,
          isTest: false,
          eligibilityStatus: 'APPROVED',
        },
        update:
          kind === 'test'
            ? {
                active: true,
                isTest: false,
                stock: 10,
                priceToman: 100000,
                eligibilityStatus: 'APPROVED',
                sellerId: seller.id,
                categoryId: category.id,
              }
            : {},
      });
      await tx.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: 'en' } },
        create: {
          productId: product.id,
          locale: 'en',
          title: 'Synthetic Ceramic Bowl',
          description: 'Synthetic handmade test product. Not for real sale.',
        },
        update:
          kind === 'test'
            ? {
                title: 'Synthetic Ceramic Bowl',
                description:
                  'Synthetic handmade test product. Not for real sale.',
              }
            : {},
      });
      await tx.address.upsert({
        where: { id: 'kk_local_address' },
        create: {
          id: 'kk_local_address',
          userId: 'kk_local_buyer',
          fullName: 'Synthetic Buyer',
          phone: '00000000000',
          country: 'IR',
          province: 'Test',
          city: 'Test',
          line1: 'Synthetic address; not deliverable',
          postal: '0000000000',
          isDefault: true,
        },
        update: {},
      });
      await tx.auditLog.upsert({
        where: { id: 'kk_local_fixture_audit' },
        create: {
          id: 'kk_local_fixture_audit',
          action: 'local_fixture_ready',
          success: true,
          metadata: { synthetic: true },
        },
        update: {},
      });
    });
    console.log(
      `Prepared synthetic ${kind} database. Local login details: .local/credentials.json (not printed).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareDatabase(process.argv[2] || 'test').catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
