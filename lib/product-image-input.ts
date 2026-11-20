import sharp from 'sharp';
import { performSecurityChecks } from './file-validation';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 64 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const IMAGE_FORMATS = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export class ProductImageInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 | 415
  ) {
    super(message);
  }
}

export async function readImageMultipart(
  request: Pick<Request, 'headers' | 'body' | 'signal'>,
  deadline = AbortSignal.timeout(90_000)
): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  if (
    contentType.split(';', 1)[0].trim().toLowerCase() !== 'multipart/form-data'
  ) {
    throw new ProductImageInputError('Expected a multipart image upload', 415);
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    throw new ProductImageInputError('Invalid upload length', 400);
  }
  const tooLarge = () =>
    new ProductImageInputError('Image upload is too large', 413);
  if (contentLength !== null && Number(contentLength) > MAX_MULTIPART_BYTES) {
    throw tooLarge();
  }

  const invalidBody = () =>
    new ProductImageInputError('Invalid image upload', 400);
  const signal = AbortSignal.any([request.signal, deadline]);
  if (!request.body || signal.aborted) throw invalidBody();

  const reader = request.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', cancel, { once: true });
  let size = 0;
  // A single bounded buffer avoids retaining an arbitrary number of chunks.
  const bytes = new Uint8Array(MAX_MULTIPART_BYTES);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw invalidBody();
      if (done) break;
      if (value.byteLength > MAX_MULTIPART_BYTES - size) {
        cancel();
        throw tooLarge();
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    return await new Response(bytes.subarray(0, size), {
      headers: { 'content-type': contentType },
    }).formData();
  } catch (error) {
    if (error instanceof ProductImageInputError) throw error;
    throw invalidBody();
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function hasMatchingSignature(buffer: Buffer, format: string): boolean {
  if (format === 'jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (format === 'png') return buffer.subarray(0, 8).equals(PNG_SIGNATURE);
  return (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

// The PNG decoder may expose only the default image for APNG. Inspect the
// bounded chunk list so accepting a single decoded frame cannot admit APNG.
function isStaticPng(buffer: Buffer): boolean {
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > buffer.length) return false;
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') return false;
    if (type === 'IEND') return length === 0 && end === buffer.length;
    offset = end;
  }
  return false;
}

export async function readProductImage(
  value: FormDataEntryValue | null
): Promise<Buffer> {
  if (!(value instanceof File) || value.size === 0) {
    throw new ProductImageInputError('A non-empty image file is required', 400);
  }
  if (value.size > MAX_FILE_BYTES) {
    throw new ProductImageInputError(
      'File too large. Maximum size is 5MB.',
      413
    );
  }
  const format = IMAGE_FORMATS.get(value.type);
  if (!format) {
    throw new ProductImageInputError(
      'Only JPEG, PNG, and WebP images are allowed',
      415
    );
  }
  const buffer = Buffer.from(await value.arrayBuffer());
  if (!hasMatchingSignature(buffer, format)) {
    throw new ProductImageInputError(
      'Image content does not match its file type',
      415
    );
  }

  const invalidImage = () =>
    new ProductImageInputError(
      'Upload a valid, non-animated image up to 24 megapixels',
      400
    );
  if (
    !performSecurityChecks(buffer).isSafe ||
    (format === 'png' && !isStaticPng(buffer))
  ) {
    throw invalidImage();
  }
  try {
    const image = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: MAX_IMAGE_PIXELS,
    });
    const {
      format: detectedFormat,
      width,
      height,
      pages = 1,
    } = await image.metadata();
    if (
      detectedFormat !== format ||
      !width ||
      !height ||
      width * height > MAX_IMAGE_PIXELS ||
      pages !== 1
    ) {
      throw invalidImage();
    }
    // Decode all pixels without retaining full-color output. Return the
    // original bytes so validation never replaces or transforms the photo.
    await image
      .removeAlpha()
      .greyscale()
      .raw({ depth: 'uchar' })
      .timeout({ seconds: 8 })
      .toBuffer();
  } catch {
    throw invalidImage();
  }
  return buffer;
}
