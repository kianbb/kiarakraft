import { z } from 'zod';
import { normalizeNationalId } from './identity-fingerprint';

const text = (min: number, max: number) => z.string().max(max).trim().min(min);

export const sellerOnboardingSchema = z
  .object({
    shopName: text(2, 200),
    displayName: text(2, 200),
    bio: text(20, 500),
    website: z
      .string()
      .max(2048)
      .trim()
      .refine(value => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      })
      .optional(),
    phone: text(10, 32),
    province: text(1, 100),
    city: text(2, 100),
    address: text(10, 1000),
    nationalId: z
      .string()
      .max(32)
      .transform(normalizeNationalId)
      .pipe(z.string().regex(/^[0-9]{10}$/)),
    uploadedDocs: z.array(z.string().max(2048).min(1)).max(5).optional(),
  })
  .strict();
