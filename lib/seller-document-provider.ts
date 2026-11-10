import { cloudinary } from './cloudinary';
import { Agent } from 'node:https';
import { assertProviderAllowed } from './deployment-policy';
import {
  DOCUMENT_MAX_BYTES,
  DocumentMime,
  DocumentRecord,
  documentLocation,
  isReadyDocument,
  SellerDocumentError,
  validateDocumentBytes,
} from './seller-documents';

const API_ORIGIN = 'https://api.cloudinary.com';
const TIMEOUT_MS = 20_000;
export function assertDocumentCollectionEnabled() {
  assertProviderAllowed('uploads');
  if (
    process.env.KK_ISOLATED === '1' ||
    process.env.SELLER_DOCUMENT_COLLECTION_ENABLED !== 'true'
  )
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
}
export function assertDocumentProviderConfigured() {
  settings();
}
function settings() {
  assertProviderAllowed('uploads');
  const shared = cloudinary.config() as Record<string, unknown>;
  // The locked SDK can prefer inherited OAuth/proxy settings over explicit keys.
  // Do not mutate the shared product-image client's configuration.
  if (
    shared.oauth_token ||
    shared.api_proxy ||
    (shared.upload_prefix && shared.upload_prefix !== API_ORIGIN)
  )
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
    !cloud ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(cloud) ||
    !key ||
    !/^\d{1,100}$/.test(key) ||
    !secret
  )
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
  return {
    cloud_name: cloud,
    api_key: key,
    api_secret: secret,
    upload_prefix: API_ORIGIN,
  };
}

export async function uploadPrivateDocument(
  buffer: Buffer,
  mime: DocumentMime,
  sellerId: string,
  id: string
) {
  assertDocumentCollectionEnabled();
  const config = settings();
  validateDocumentBytes(buffer, mime);
  const location = documentLocation(sellerId, id, mime);
  try {
    await new Promise<void>((resolve, reject) => {
      const agent = new Agent({ keepAlive: false, rejectUnauthorized: true });
      let stream:
        | ReturnType<typeof cloudinary.uploader.upload_stream>
        | undefined;
      const timer = setTimeout(() => {
        stream?.destroy();
        agent.destroy();
        reject(new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503));
      }, TIMEOUT_MS);
      try {
        stream = cloudinary.uploader.upload_stream(
          {
            ...config,
            agent,
            public_id: location.publicId,
            resource_type: location.resourceType,
            type: 'authenticated',
            overwrite: false,
            unique_filename: false,
            use_filename: false,
            timeout: TIMEOUT_MS,
          },
          (error, result) => {
            clearTimeout(timer);
            agent.destroy();
            if (
              error ||
              !result ||
              result.public_id !== location.publicId ||
              result.resource_type !== location.resourceType ||
              result.type !== 'authenticated' ||
              !Number.isInteger(result.bytes) ||
              result.bytes < 1 ||
              result.bytes > DOCUMENT_MAX_BYTES
            )
              reject(new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503));
            else resolve();
          }
        );
        stream.once('error', () => {
          clearTimeout(timer);
          agent.destroy();
          reject(new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503));
        });
        stream.end(buffer);
      } catch {
        clearTimeout(timer);
        agent.destroy();
        reject(new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503));
      }
    });
  } catch {
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
  }
}

/** Signing stays server-side; the browser receives only an authorized attachment. */
export async function downloadPrivateDocument(
  doc: DocumentRecord,
  fetchImpl: typeof fetch = fetch
) {
  if (!isReadyDocument(doc))
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 409);
  const config = settings();
  const location = documentLocation(
    doc.sellerId,
    doc.id,
    doc.mime as DocumentMime
  );
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const expiresAt = timestamp + 60;
    const signingOptions = {
      ...config,
      resource_type: location.resourceType,
      type: 'authenticated' as const,
      timestamp,
      expires_at: expiresAt,
      attachment: true,
    };
    const signed = cloudinary.utils.private_download_url(
      doc.publicId,
      location.format,
      signingOptions
    );
    const url = new URL(signed);
    const keys = [
      'timestamp',
      'public_id',
      'format',
      'type',
      'attachment',
      'expires_at',
      'api_key',
      'signature',
    ];
    if (
      [...url.searchParams.keys()].some(key => !keys.includes(key)) ||
      keys.some(
        key =>
          url.searchParams.getAll(key).length !==
          (key === 'format' && location.format === '' ? 0 : 1)
      ) ||
      url.searchParams.get('timestamp') !== String(timestamp) ||
      url.searchParams.get('expires_at') !== String(expiresAt) ||
      url.searchParams.get('attachment') !== 'true' ||
      (url.searchParams.get('format') || '') !== location.format
    )
      throw new Error();
    if (
      url.origin !== API_ORIGIN ||
      url.hash ||
      url.username ||
      url.password ||
      url.pathname !==
        `/v1_1/${config.cloud_name}/${location.resourceType}/download` ||
      url.searchParams.get('public_id') !== location.publicId ||
      url.searchParams.get('type') !== 'authenticated' ||
      url.searchParams.get('api_key') !== config.api_key ||
      !url.searchParams.get('signature')
    )
      throw new Error();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let result: Response | undefined;
    try {
      result = await fetchImpl(url, {
        redirect: 'manual',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (result.status !== 200 || result.redirected || !result.body)
        throw new Error();
      const length = result.headers.get('content-length');
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > DOCUMENT_MAX_BYTES)
      )
        throw new Error();
      const reader = result.body.getReader();
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > DOCUMENT_MAX_BYTES) throw new Error();
          chunks.push(item.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const buffer = Buffer.concat(chunks);
      validateDocumentBytes(buffer, doc.mime);
      return { buffer, mime: doc.mime, extension: location.extension };
    } finally {
      controller.abort();
      if (result?.body && !result.body.locked)
        void result.body.cancel().catch(() => {});
      clearTimeout(timer);
    }
  } catch {
    throw new SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
  }
}
