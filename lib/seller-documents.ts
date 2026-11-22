import { validateFile, performSecurityChecks } from './file-validation';

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_COUNT = 5;
export const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const DOCUMENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const DOCUMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;
export type DocumentMime = (typeof DOCUMENT_MIMES)[number];

export class SellerDocumentError extends Error {
  constructor(
    public code:
      | 'DOCUMENT_INVALID'
      | 'DOCUMENT_TOO_LARGE'
      | 'DOCUMENT_LIMIT'
      | 'DOCUMENT_RECONCILIATION_REQUIRED'
      | 'DOCUMENT_UNAVAILABLE',
    public status = 400
  ) {
    super('Verification document operation unavailable');
  }
}

export type DocumentRecord = {
  id: string;
  sellerId: string;
  publicId: string;
  mime: string;
  bytes: number;
  createdAt: Date;
  resourceType: string | null;
  deliveryType: string | null;
  status: string | null;
};

export function documentLocation(
  sellerId: string,
  id: string,
  mime: DocumentMime
) {
  if (!DOCUMENT_ID.test(sellerId) || !DOCUMENT_UUID.test(id))
    throw new SellerDocumentError('DOCUMENT_INVALID');
  return {
    publicId: `kiarakraft/private-seller-documents/${sellerId}/${id}${mime === 'application/pdf' ? '.pdf' : ''}`,
    resourceType:
      mime === 'application/pdf' ? ('raw' as const) : ('image' as const),
    format: mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : '',
    extension:
      mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg',
  };
}

export function isReadyDocument(doc: DocumentRecord): boolean {
  if (
    !DOCUMENT_MIMES.includes(doc.mime as DocumentMime) ||
    doc.status !== 'READY' ||
    doc.deliveryType !== 'authenticated' ||
    !Number.isInteger(doc.bytes) ||
    doc.bytes < 1 ||
    doc.bytes > DOCUMENT_MAX_BYTES
  )
    return false;
  try {
    const expected = documentLocation(
      doc.sellerId,
      doc.id,
      doc.mime as DocumentMime
    );
    return (
      doc.publicId === expected.publicId &&
      doc.resourceType === expected.resourceType
    );
  } catch {
    return false;
  }
}

export function documentDownloadPath(sellerId: string, id: string) {
  if (!DOCUMENT_ID.test(sellerId) || !DOCUMENT_ID.test(id))
    throw new SellerDocumentError('DOCUMENT_INVALID');
  return `/api/admin/sellers/${encodeURIComponent(sellerId)}/documents/${encodeURIComponent(id)}`;
}

export function documentDto(doc: DocumentRecord) {
  const available = isReadyDocument(doc);
  return {
    id: doc.id,
    mime: DOCUMENT_MIMES.includes(doc.mime as DocumentMime) ? doc.mime : null,
    bytes: doc.bytes,
    createdAt: doc.createdAt,
    available,
    downloadPath: available ? documentDownloadPath(doc.sellerId, doc.id) : null,
  };
}

export function validateDocumentBytes(
  buffer: Buffer,
  reportedMime: string
): DocumentMime {
  if (buffer.length > DOCUMENT_MAX_BYTES)
    throw new SellerDocumentError('DOCUMENT_TOO_LARGE', 413);
  const result = validateFile(buffer, reportedMime, [...DOCUMENT_MIMES]);
  if (
    !result.isValid ||
    result.detectedType?.mimeType !== reportedMime ||
    !performSecurityChecks(buffer).isSafe
  )
    throw new SellerDocumentError('DOCUMENT_INVALID');
  return result.detectedType.mimeType as DocumentMime;
}

// Bound the multipart body before formData() can buffer an unbounded upload.
export async function readDocumentFile(
  request: Request
): Promise<{ buffer: Buffer; mime: DocumentMime }> {
  const maximum = DOCUMENT_MAX_BYTES + 64 * 1024;
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    void request.body?.cancel().catch(() => {});
    throw new SellerDocumentError('DOCUMENT_TOO_LARGE', 413);
  }
  if (
    !request.headers.get('content-type')?.startsWith('multipart/form-data;') ||
    !request.body
  ) {
    void request.body?.cancel().catch(() => {});
    throw new SellerDocumentError('DOCUMENT_INVALID');
  }
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > maximum)
            throw new SellerDocumentError('DOCUMENT_TOO_LARGE', 413);
          chunks.push(item.value);
        }
        const multipart = new Response(Buffer.concat(chunks), {
          headers: { 'content-type': request.headers.get('content-type')! },
        });
        let form: FormData;
        try {
          form = await multipart.formData();
        } catch {
          throw new SellerDocumentError('DOCUMENT_INVALID');
        }
        const entries = [...form.entries()];
        const file = form.get('file');
        if (
          !(file instanceof File) ||
          entries.filter(([key]) => key === 'file').length !== 1 ||
          entries.some(([key]) => !['file', 'type'].includes(key))
        )
          throw new SellerDocumentError('DOCUMENT_INVALID');
        if (file.size < 1 || file.size > DOCUMENT_MAX_BYTES)
          throw new SellerDocumentError('DOCUMENT_TOO_LARGE', 413);
        const buffer = Buffer.from(await file.arrayBuffer());
        return { buffer, mime: validateDocumentBytes(buffer, file.type) };
      })(),
      new Promise<never>((_, reject) => {
        abort = () => {
          reject(new SellerDocumentError('DOCUMENT_UNAVAILABLE', 408));
          void reader.cancel().catch(() => {});
        };
        timer = setTimeout(abort, 60_000);
        request.signal.addEventListener('abort', abort, { once: true });
        if (request.signal.aborted) abort();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) request.signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
