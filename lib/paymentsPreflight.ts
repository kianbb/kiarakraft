// Helper to handle payment preflight failure: cancel order and restore cart from order items
// Kept small and dependency-light for easy testing.

export type OrderItemSnapshot = {
  productId: string;
  quantity: number;
};

export type MinimalTx = {
  order: {
    update(args: {
      where: { id: string };
      data: { status: 'CANCELED' };
    }): Promise<unknown>;
  };
  cart: {
    upsert(args: {
      where: { userId: string };
      create: { userId: string };
      update: Record<string, never>;
    }): Promise<{ id: string }>;
  };
  cartItem: {
    upsert(args: {
      where: { cartId_productId: { cartId: string; productId: string } };
      update: { quantity: number };
      create: { cartId: string; productId: string; quantity: number };
    }): Promise<unknown>;
  };
};

export async function cancelOrderAndRestoreCart(
  tx: MinimalTx,
  userId: string,
  orderId: string,
  items: OrderItemSnapshot[]
): Promise<{ orderCanceled: true; cartRestored: true }> {
  await tx.order.update({
    where: { id: orderId },
    data: { status: 'CANCELED' },
  });

  const cart = await tx.cart.upsert({
    where: { userId },
    create: { userId },
    update: {} as Record<string, never>,
  });

  for (const it of items) {
    await tx.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: it.productId } },
      update: { quantity: it.quantity },
      create: {
        cartId: cart.id,
        productId: it.productId,
        quantity: it.quantity,
      },
    });
  }

  return { orderCanceled: true, cartRestored: true } as const;
}
