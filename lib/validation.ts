import { z } from 'zod';

export const orderIdSchema = z.string().regex(/^[a-zA-Z0-9]+$/, 'Invalid orderId format');

export function parseOrderId(input: unknown): string {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid orderId');
  }
  return parsed.data;
}
