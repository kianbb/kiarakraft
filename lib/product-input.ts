import { z } from 'zod';
import { readJsonInput } from './json-input';

export const PRODUCT_INPUT_LIMITS = {
  bodyBytes: 64 * 1024,
  postgresIntMax: 2_147_483_647,
  title: 200,
  description: 5000,
  category: 80,
  slug: 200,
  images: 10,
  imageUrl: 2048,
  imageAlt: 200,
  tags: 20,
  tag: 80,
  tagsText: 2000,
} as const;

const nonnegativeInteger = z
  .number()
  .int()
  .min(0)
  .max(PRODUCT_INPUT_LIMITS.postgresIntMax);
const title = z.string().max(PRODUCT_INPUT_LIMITS.title).trim().min(1);
const description = z
  .string()
  .max(PRODUCT_INPUT_LIMITS.description)
  .trim()
  .min(10);
const category = z
  .string()
  .max(PRODUCT_INPUT_LIMITS.category)
  .regex(/^[a-z0-9-]*$/);
const imageUrl = z
  .string()
  .max(PRODUCT_INPUT_LIMITS.imageUrl)
  .refine(value => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' && !url.username && !url.password && !url.hash
      );
    } catch {
      return false;
    }
  }, 'Image URL must use HTTPS without credentials or a fragment');
const tag = z.string().max(PRODUCT_INPUT_LIMITS.tag).trim().min(1);
const tags = z.union([
  z.array(tag).max(PRODUCT_INPUT_LIMITS.tags),
  z
    .string()
    .max(PRODUCT_INPUT_LIMITS.tagsText)
    .refine(value => {
      const entries = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      return (
        entries.length <= PRODUCT_INPUT_LIMITS.tags &&
        entries.every(item => item.length <= PRODUCT_INPUT_LIMITS.tag)
      );
    }, 'Provide at most 20 tags of at most 80 characters each'),
]);
const image = z
  .object({
    url: imageUrl,
    alt: z.string().max(PRODUCT_INPUT_LIMITS.imageAlt).optional(),
    sortOrder: z
      .number()
      .int()
      .min(0)
      .max(PRODUCT_INPUT_LIMITS.images - 1)
      .optional(),
  })
  .strict();

export const createProductSchema = z
  .object({
    name: title,
    description,
    price: nonnegativeInteger,
    // Preserve the database default and the API's existing optional-image behavior.
    stock: nonnegativeInteger.default(0),
    category: category.optional(),
    slug: z
      .string()
      .max(PRODUCT_INPUT_LIMITS.slug)
      .regex(/^[\p{L}\p{N}-]*$/u)
      .optional(),
    images: z.array(image).max(PRODUCT_INPUT_LIMITS.images).default([]),
    tags: tags.optional(),
    useAI: z.boolean().default(true),
  })
  .strict();

export const updateProductSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    priceToman: nonnegativeInteger.optional(),
    stock: nonnegativeInteger.optional(),
    active: z.boolean().optional(),
    // These fields are sent by the existing edit form. Validation does not add
    // persistence behavior for fields the route currently ignores.
    category: category.optional(),
    imageUrl: z.union([z.literal(''), imageUrl]).optional(),
    tags: tags.optional(),
    useAI: z.boolean().default(true),
  })
  .strict()
  .refine(
    data =>
      [
        data.title,
        data.description,
        data.priceToman,
        data.stock,
        data.active,
      ].some(value => value !== undefined),
    'Provide at least one editable product field'
  );

// Keep the product-facing contract while sharing the bounded JSON reader.
export { JsonInputError as ProductInputError } from './json-input';
export async function readProductInput<T extends z.ZodType>(
  request: Pick<Request, 'headers' | 'body'>,
  schema: T
): Promise<z.output<T>> {
  return readJsonInput(request, schema, PRODUCT_INPUT_LIMITS.bodyBytes);
}
