import '../scripts/dev/guard-test.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prisma } from '../lib/prisma';
import {
  reserveDocument,
  finalizeDocument,
  ownedReadyDocuments,
} from '../lib/seller-document-store';

async function main() {
  const userIds: string[] = [];
  try {
    const makeSeller = async () => {
      const user = await prisma.user.create({
        data: {
          email: `docs-${randomUUID()}@example.invalid`,
          password: 'synthetic-only',
          role: 'SELLER',
          sellerProfile: {
            create: {
              handle: `docs-${randomUUID()}`,
              shopName: 'Synthetic document shop',
              displayName: 'Synthetic seller',
            },
          },
        },
        include: { sellerProfile: true },
      });
      userIds.push(user.id);
      return user.sellerProfile!.id;
    };
    const seller = await makeSeller(),
      other = await makeSeller();
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        reserveDocument(seller, 'application/pdf', 32)
      )
    );
    assert.ok(attempts.some(r => r.status === 'fulfilled'));
    let rows = await prisma.sellerDocument.findMany({
      where: { sellerId: seller },
    });
    assert.ok(rows.length <= 5);
    assert.equal(
      rows.every(
        r =>
          r.status === 'PENDING' &&
          r.deliveryType === 'authenticated' &&
          r.url === ''
      ),
      true
    );
    while (rows.length < 5) {
      await reserveDocument(seller, 'application/pdf', 32);
      rows = await prisma.sellerDocument.findMany({
        where: { sellerId: seller },
      });
    }
    await assert.rejects(() => reserveDocument(seller, 'application/pdf', 32));
    assert.equal(
      await prisma.sellerDocument.count({ where: { sellerId: seller } }),
      5
    );
    await finalizeDocument(rows[0].id, seller);
    const ready = await ownedReadyDocuments(seller, [rows[0].id]);
    assert.equal(ready.length, 1);
    await assert.rejects(() => ownedReadyDocuments(other, [rows[0].id]));
    await assert.rejects(() =>
      ownedReadyDocuments(seller, [rows[0].id, rows[0].id])
    );
    await assert.rejects(() => ownedReadyDocuments(seller, [rows[1].id]));
    const legacy = await prisma.sellerDocument.create({
      data: {
        sellerId: other,
        publicId: 'preserved/legacy/reference',
        url: 'https://asset.example.invalid/preserved',
        mime: 'application/pdf',
        bytes: 32,
      },
    });
    await assert.rejects(() => reserveDocument(other, 'application/pdf', 32));
    assert.deepEqual(
      await prisma.sellerDocument.findUnique({ where: { id: legacy.id } }),
      legacy
    );
    await prisma.sellerProfile.update({
      where: { id: other },
      data: { docsFolder: 'preserved/legacy/folder' },
    });
    await assert.rejects(() => reserveDocument(other, 'application/pdf', 32));
    assert.equal(
      (await prisma.sellerProfile.findUnique({ where: { id: other } }))
        ?.docsFolder,
      'preserved/legacy/folder'
    );
    await prisma.$transaction(async tx => {
      const table = `doc_migration_${randomUUID().replaceAll('-', '')}`;
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "${table}" ("id" text, "sellerId" text, "publicId" text, "url" text, "mime" text, "bytes" int, "createdAt" timestamptz) ON COMMIT DROP`
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "${table}" VALUES ('synthetic','seller','unchanged-public-id','https://example.invalid/unchanged','application/pdf',32,'2026-01-01T00:00:00Z')`
      );
      const before = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${table}"`
      );
      const migration = readFileSync(
        new URL(
          '../prisma/migrations/20261110220000_private_seller_documents/migration.sql',
          import.meta.url
        ),
        'utf8'
      ).replace('"SellerDocument"', `"${table}"`);
      await tx.$executeRawUnsafe(migration);
      const after = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${table}" /* after nullable migration */`
      );
      const { resourceType, deliveryType, status, ...old } = after[0];
      assert.deepEqual(old, before[0]);
      assert.equal(resourceType, null);
      assert.equal(deliveryType, null);
      assert.equal(status, null);
    });
    console.log(
      'Seller document integration: concurrent cap, scoped READY references, legacy preservation and nullable migration passed.'
    );
  } finally {
    for (const id of userIds) {
      const seller = await prisma.sellerProfile.findUnique({
        where: { userId: id },
        select: { id: true },
      });
      if (seller)
        await prisma.sellerDocument.deleteMany({
          where: { sellerId: seller.id },
        });
      await prisma.sellerProfile.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
