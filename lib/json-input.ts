import { z } from 'zod';

export class JsonInputError extends Error {
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
export async function readJsonInput<T extends z.ZodType>(
  request: Pick<Request, 'headers' | 'body'>,
  schema: T,
  maxBytes: number
): Promise<z.output<T>> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim();
  if (contentType && contentType !== 'application/json') {
    throw new JsonInputError('Content-Type must be application/json', 415);
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new JsonInputError('Invalid Content-Length', 400);
    }
    if (Number(declaredLength) > maxBytes) {
      throw new JsonInputError('JSON input is too large', 413);
    }
  }
  if (!request.body) throw new JsonInputError('Invalid JSON body', 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        // Cancel without waiting for an untrusted source's cancellation hook.
        void reader.cancel().catch(() => {});
        throw new JsonInputError('JSON input is too large', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof JsonInputError) throw error;
    throw new JsonInputError('Invalid JSON body', 400);
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new JsonInputError('Invalid JSON body', 400);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'body';
      if (!fields[path]) fields[path] = issue.message;
    }
    throw new JsonInputError('Invalid JSON data', 400, fields);
  }
  return result.data;
}
