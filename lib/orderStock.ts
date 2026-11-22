import type { Prisma } from '@prisma/client';
import { publicProductWhere } from './public-product';

type StockTransaction = {
  product: {
    updateMany(args: {
      where: Prisma.ProductWhereInput;
      data: Prisma.ProductUpdateManyMutationInput;
    }): Promise<{ count: number }>;
  };
};

// Run inside the payment transaction so any unavailable item rolls back the
// entire capture. The eligibility and stock checks belong to the atomic write.
export async function decrementOrderableStock(
  tx: StockTransaction,
  items: { productId: string; quantity: number }[]
) {
  for (const item of items) {
    const updated = await tx.product.updateMany({
      where: {
        ...publicProductWhere,
        id: item.productId,
        stock: { gte: item.quantity },
      },
      data: { stock: { decrement: item.quantity } },
    });
    if (updated.count !== 1) {
      throw new Error(
        'Product unavailable or insufficient stock while finalizing order'
      );
    }
  }
}
