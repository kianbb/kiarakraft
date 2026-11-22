import type { PrismaClient } from '@prisma/client';

export interface ProductRatingSummary {
  average: number;
  count: number;
}

export async function getApprovedProductRatings(
  reviews: Pick<PrismaClient['review'], 'groupBy'>,
  productIds: string[]
): Promise<Map<string, ProductRatingSummary>> {
  const ratings = new Map<string, ProductRatingSummary>();
  if (productIds.length === 0) return ratings;

  const groups = await reviews.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { rating: true },
  });

  for (const group of groups) {
    if (group._avg.rating !== null) {
      ratings.set(group.productId, {
        average: group._avg.rating,
        count: group._count.rating,
      });
    }
  }

  return ratings;
}
