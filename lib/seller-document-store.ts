import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import {
  DOCUMENT_MAX_COUNT,
  DocumentMime,
  documentLocation,
  SellerDocumentError,
  isReadyDocument,
} from './seller-documents';

export async function reserveDocument(
  sellerId: string,
  mime: DocumentMime,
  bytes: number
) {
  const id = randomUUID();
  const location = documentLocation(sellerId, id, mime);
  return prisma.$transaction(
    async tx => {
      // Serializes reservations for one seller, including empty initial tables.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sellerId}, 4217))`;
      const seller = await tx.sellerProfile.findUnique({
        where: { id: sellerId },
        select: { docsFolder: true },
      });
      if (!seller) throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
      const rows = await tx.sellerDocument.findMany({
        where: { sellerId },
        select: { deliveryType: true, status: true },
      });
      // Old folder metadata can be incomplete. Never call a DB-only count a full
      // legacy inventory, or guess/delete old assets to admit a new upload.
      if (
        seller.docsFolder !== null ||
        rows.some(
          row => row.deliveryType !== 'authenticated' || row.status === null
        )
      )
        throw new SellerDocumentError('DOCUMENT_RECONCILIATION_REQUIRED', 409);
      // Failed/pending reservations remain counted until deliberate reconciliation.
      if (rows.length >= DOCUMENT_MAX_COUNT)
        throw new SellerDocumentError('DOCUMENT_LIMIT', 409);
      return tx.sellerDocument.create({
        data: {
          id,
          sellerId,
          publicId: location.publicId,
          url: '',
          mime,
          bytes,
          resourceType: location.resourceType,
          deliveryType: 'authenticated',
          status: 'PENDING',
        },
      });
    },
    { isolationLevel: 'Serializable' }
  );
}

export async function finalizeDocument(id: string, sellerId: string) {
  const result = await prisma.sellerDocument.updateMany({
    where: { id, sellerId, status: 'PENDING', deliveryType: 'authenticated' },
    data: { status: 'READY' },
  });
  if (result.count !== 1)
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
}

export async function failDocument(id: string, sellerId: string) {
  // Keep the private reference for reconciliation; never delete provider assets
  // based on an ambiguous timeout or database failure.
  await prisma.sellerDocument.updateMany({
    where: { id, sellerId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}

export async function ownedReadyDocuments(sellerId: string, ids: string[]) {
  if (new Set(ids).size !== ids.length)
    throw new SellerDocumentError('DOCUMENT_INVALID');
  const docs = await prisma.sellerDocument.findMany({
    where: { sellerId, id: { in: ids } },
  });
  if (docs.length !== ids.length || docs.some(doc => !isReadyDocument(doc)))
    throw new SellerDocumentError('DOCUMENT_INVALID');
  return docs;
}
