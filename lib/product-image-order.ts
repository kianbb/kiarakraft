import type { PrismaClient } from '@prisma/client';

export class ImageOrderError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404
  ) {
    super(message);
  }
}

// The caller must authorize ownership of productId before invoking this function.
export async function reorderProductImages(
  database: Pick<PrismaClient, '$transaction'>,
  productId: string,
  order: unknown
) {
  if (
    !Array.isArray(order) ||
    order.length === 0 ||
    order.length > 10 ||
    order.some(
      item =>
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        item.id.length > 100 ||
        !Number.isInteger(item.sortOrder) ||
        item.sortOrder < 0 ||
        item.sortOrder > 9
    ) ||
    new Set(order.map(item => item.id)).size !== order.length ||
    new Set(order.map(item => item.sortOrder)).size !== order.length
  ) {
    throw new ImageOrderError('Invalid image order', 400);
  }
  const updates = order as Array<{ id: string; sortOrder: number }>;
  await database.$transaction(async tx => {
    const images = await tx.listingImage.findMany({
      where: { productId, id: { in: updates.map(item => item.id) } },
      select: { id: true },
    });
    if (images.length !== updates.length) {
      throw new ImageOrderError('Image not found in this product', 404);
    }
    for (const item of updates) {
      await tx.listingImage.update({
        where: { id: item.id, productId },
        data: { sortOrder: item.sortOrder },
      });
    }
  });
}
