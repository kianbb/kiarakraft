export const RETURN_WINDOW_DAYS = 30;

export function returnIneligibility(
  order: {
    status: string;
    updatedAt: Date;
    payment?: { status: string } | null;
  },
  now = Date.now()
) {
  if (order.payment?.status !== 'PAID') return 'unpaid';
  if (order.status !== 'DELIVERED') return 'undelivered';

  // Match the existing return policy until the pilot deadline is decided.
  const daysSinceDelivery = Math.floor(
    (now - order.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceDelivery > RETURN_WINDOW_DAYS ? 'expired' : null;
}
