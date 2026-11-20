import type { Prisma } from '@prisma/client';

export class OfflinePaymentOrderConflict extends Error {
  constructor() {
    super('Order state or amount changed. Refresh and verify the payment.');
  }
}

// Call inside the capture transaction, after locking the payment row. An
// order cancellation or amount change must win or lose at the database write.
export async function claimOfflinePaymentOrder(
  tx: Pick<Prisma.TransactionClient, 'order'>,
  payment: { orderId: string; amountToman: number }
) {
  if (!Number.isSafeInteger(payment.amountToman) || payment.amountToman <= 0) {
    throw new OfflinePaymentOrderConflict();
  }

  const claimed = await tx.order.updateMany({
    where: {
      id: payment.orderId,
      status: 'PENDING',
      totalToman: payment.amountToman,
    },
    data: { status: 'PAID' },
  });
  if (claimed.count !== 1) throw new OfflinePaymentOrderConflict();
}
