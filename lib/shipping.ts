// The checkout display and order API share these prices in Toman. The server
// derives the charge from the method; a browser-supplied price is never trusted.
export const SHIPPING_METHODS = ['STANDARD', 'EXPRESS', 'PICKUP'] as const;

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const SHIPPING_PRICES: Readonly<Record<ShippingMethod, number>> =
  Object.freeze({
    STANDARD: 50000,
    EXPRESS: 120000,
    PICKUP: 0,
  });
