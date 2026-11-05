import { z } from 'zod';

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

export class ProductInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 | 415,
    public readonly fields: Record<string, string> = {}
  ) {
    super(message);
  }
}

// Bound bytes while reading rather than trusting Content-Length or buffering an
// arbitrarily large JSON body. This is an input boundary, not a remote-fetch guard.
export async function readProductInput<T extends z.ZodType>(
  request: Pick<Request, 'headers' | 'body'>,
  schema: T
): Promise<z.output<T>> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim();
  if (contentType && contentType !== 'application/json') {
    throw new ProductInputError('Content-Type must be application/json', 415);
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new ProductInputError('Invalid Content-Length', 400);
    }
    if (Number(declaredLength) > PRODUCT_INPUT_LIMITS.bodyBytes) {
      throw new ProductInputError('Product input is too large', 413);
    }
  }
  if (!request.body) throw new ProductInputError('Invalid JSON body', 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PRODUCT_INPUT_LIMITS.bodyBytes) {
        // Cancel without waiting for an untrusted source's cancellation hook.
        void reader.cancel().catch(() => {});
        throw new ProductInputError('Product input is too large', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ProductInputError) throw error;
    throw new ProductInputError('Invalid JSON body', 400);
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ProductInputError('Invalid JSON body', 400);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'body';
      if (!fields[path]) fields[path] = issue.message;
    }
    throw new ProductInputError('Invalid product data', 400, fields);
  }
  return result.data;
}
