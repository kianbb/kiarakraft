import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { Writable, PassThrough } from 'node:stream';
import * as fileValidation from '../lib/file-validation';
import {
  createDocumentReviewLoader,
  documentReviewForSeller,
  type DocumentReviewState,
} from '../lib/seller-document-review';
import * as onboardingInput from '../lib/seller-onboarding-input';
import * as jsonInput from '../lib/json-input';
import { z } from 'zod';
import * as docs from '../lib/seller-documents';
import { loadRoute } from './helpers/load-route';

const id = '1d41dba8-d51a-4b22-a8bf-65eb5343ba3b';
const sellerId = 'synthetic-seller';
const pdf = Buffer.from('%PDF-1.7\nSynthetic document bytes\n%%EOF');
const base = {
  id,
  sellerId,
  publicId: docs.documentLocation(sellerId, id, 'application/pdf').publicId,
  mime: 'application/pdf',
  bytes: pdf.length,
  createdAt: new Date(),
  resourceType: 'raw',
  deliveryType: 'authenticated',
  status: 'READY',
};
const globals = {
  Buffer,
  Request,
  Response,
  FormData,
  File,
  Uint8Array,
  AbortController,
  setTimeout,
  clearTimeout,
};
const json = (data: unknown, options?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...Object.fromEntries(new Headers(options?.headers)),
    },
  });
async function main() {
  process.env = { NODE_ENV: 'test' };
  const { v2: sdk } = await import('cloudinary');
  let actualNetworkCalls = 0;
  const connect = net.Socket.prototype.connect,
    secure = tls.connect;
  net.Socket.prototype.connect = function () {
    actualNetworkCalls++;
    throw Error('Network forbidden');
  };
  tls.connect = (() => {
    actualNetworkCalls++;
    throw Error('Network forbidden');
  }) as typeof tls.connect;
  try {
    let groups = 0;
    assert.equal(docs.isReadyDocument(base), true);
    for (const patch of [
      { deliveryType: null },
      { status: null },
      { publicId: 'arbitrary/path' },
      { sellerId: 'another' },
      { resourceType: 'image' },
      { mime: 'text/html' },
      { id: '../outside' },
    ])
      assert.equal(docs.isReadyDocument({ ...base, ...patch }), false);
    const dto = JSON.stringify(docs.documentDto(base));
    for (const secret of [
      'publicId',
      'url',
      'authenticated',
      'private-seller-documents',
    ])
      assert.ok(!dto.includes(secret));
    assert.equal(
      docs.documentDto({ ...base, deliveryType: null }).downloadPath,
      null
    );
    groups++;
    assert.equal(
      docs.validateDocumentBytes(pdf, 'application/pdf'),
      'application/pdf'
    );
    for (const [buffer, mime] of [
      [pdf, 'image/png'],
      [Buffer.from('<svg>bad</svg>'), 'image/svg+xml'],
      [Buffer.alloc(docs.DOCUMENT_MAX_BYTES + 1), 'application/pdf'],
    ] as const)
      assert.throws(() => docs.validateDocumentBytes(buffer, mime));
    groups++;
    let pulled = 0;
    const oversized = new Request('http://local.invalid', {
      method: 'POST',
      headers: {
        'content-length': String(docs.DOCUMENT_MAX_BYTES + 65537),
        'content-type': 'multipart/form-data; boundary=x',
      },
      body: new ReadableStream({
        pull() {
          pulled++;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    await assert.rejects(() => docs.readDocumentFile(oversized));
    assert.ok(pulled <= 1);
    groups++;
    let multipartCancelled = false;
    const streamed = new Request('http://local.invalid', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(docs.DOCUMENT_MAX_BYTES + 65537));
        },
        cancel() {
          multipartCancelled = true;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    await assert.rejects(() => docs.readDocumentFile(streamed));
    assert.equal(multipartCancelled, true);
    groups++;
    let stalledCancelled = false;
    const timedDocs = loadRoute<typeof docs>(
      'lib/seller-documents.ts',
      { './file-validation': fileValidation },
      {
        globals: {
          ...globals,
          setTimeout: (fn: () => void) => setTimeout(fn, 10),
        },
      }
    );
    const stalled = new Request('http://local.invalid', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: new ReadableStream({
        cancel() {
          stalledCancelled = true;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    await assert.rejects(() => timedDocs.readDocumentFile(stalled));
    assert.equal(stalledCancelled, true);
    groups++;
    const form = new FormData();
    form.append(
      'file',
      new File([pdf], 'irrelevant-private-name.pdf', {
        type: 'application/pdf',
      })
    );
    const parsed = await docs.readDocumentFile(
      new Request('http://local.invalid', { method: 'POST', body: form })
    );
    assert.equal(parsed.buffer.toString(), pdf.toString());
    groups++;

    function provider(
      mode = 'normal',
      extraEnv: Record<string, string | undefined> = {}
    ) {
      const state = {
        uploads: 0,
        fetches: 0,
        destroyed: 0,
        aborted: false,
        cancelled: 0,
        options: {} as Record<string, unknown>,
      };
      const env = {
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'synthetic-cloud',
        CLOUDINARY_API_KEY: '123',
        CLOUDINARY_API_SECRET: 'test-only-not-a-provider-key',
        SELLER_DOCUMENT_COLLECTION_ENABLED: 'true',
        ...extraEnv,
      };
      const providerModule = loadRoute<
        typeof import('../lib/seller-document-provider')
      >(
        'lib/seller-document-provider.ts',
        {
          './seller-documents': docs,
          'node:https': { Agent: https.Agent },
          './deployment-policy': {
            assertProviderAllowed: () => {
              if (mode === 'stage') throw Error('disabled');
            },
          },
          './cloudinary': {
            cloudinary: {
              config: () => ({}),
              uploader: {
                upload_stream: (
                  options: Record<string, unknown>,
                  callback: (err: unknown, value?: unknown) => void
                ) => {
                  state.uploads++;
                  state.options = options;
                  const stream = new EventEmitter() as EventEmitter & {
                    end: (b: Buffer) => void;
                    destroy: () => void;
                  };
                  stream.destroy = () => {
                    state.destroyed++;
                  };
                  stream.end = () => {
                    if (mode === 'close-never-callback') {
                      stream.emit('close');
                      return;
                    }
                    callback(
                      mode === 'provider-error'
                        ? Error('private-url-and-body')
                        : null,
                      {
                        public_id:
                          mode === 'wrong-public-id'
                            ? 'foreign'
                            : options.public_id,
                        resource_type: options.resource_type,
                        type:
                          mode === 'public-response'
                            ? 'upload'
                            : 'authenticated',
                        bytes: pdf.length,
                      }
                    );
                  };
                  return stream;
                },
              },
              utils: {
                private_download_url: (
                  publicId: string,
                  format: string,
                  options: Record<string, unknown>
                ) => {
                  const url = new URL(
                    sdk.utils.private_download_url(publicId, format, options)
                  );
                  if (mode === 'foreign-origin')
                    url.hostname = 'outside.invalid';
                  if (mode === 'duplicate-param')
                    url.searchParams.append('public_id', 'foreign');
                  if (mode === 'wrong-expiry')
                    url.searchParams.set('expires_at', '999999999999');
                  return url.toString();
                },
              },
            },
          },
        },
        {
          globals: {
            ...globals,
            process: { env: mode === 'missing-config' ? {} : env },
            setTimeout: (fn: () => void, delay: number) =>
              setTimeout(fn, Math.min(delay, 50)),
            fetch: () => {
              throw Error('Network forbidden');
            },
          },
        }
      );
      const fetchImpl: typeof fetch = async (_url, options) => {
        state.fetches++;
        assert.equal(options?.redirect, 'manual');
        assert.equal(options?.cache, 'no-store');
        assert.ok(options?.signal);
        options?.signal?.addEventListener('abort', () => {
          state.aborted = true;
        });
        const openBody = (oversized = false) =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                oversized
                  ? new Uint8Array(docs.DOCUMENT_MAX_BYTES + 1)
                  : Uint8Array.from(pdf)
              );
            },
            cancel() {
              state.cancelled++;
            },
          });
        if (mode === 'redirect')
          return new Response(openBody(), {
            status: 302,
            headers: { location: 'http://127.0.0.1/private' },
          });
        if (mode === 'oversized-response')
          return new Response(openBody(), {
            headers: { 'content-length': String(docs.DOCUMENT_MAX_BYTES + 1) },
          });
        if (mode === 'unknown-length-oversized')
          return new Response(openBody(true));
        if (mode === 'wrong-content') return new Response('html is not a PDF');
        return new Response(Uint8Array.from(pdf));
      };
      return { module: providerModule, state, fetchImpl };
    }
    for (const mode of [
      'normal',
      'provider-error',
      'wrong-public-id',
      'public-response',
      'close-never-callback',
    ]) {
      const p = provider(mode);
      if (mode === 'normal') {
        await p.module.uploadPrivateDocument(
          pdf,
          'application/pdf',
          sellerId,
          id
        );
        assert.equal(p.state.options.type, 'authenticated');
        assert.equal(p.state.options.resource_type, 'raw');
        assert.equal(p.state.options.overwrite, false);
        assert.equal(p.state.options.use_filename, false);
      } else
        await assert.rejects(() =>
          p.module.uploadPrivateDocument(pdf, 'application/pdf', sellerId, id)
        );
      if (mode === 'close-never-callback') assert.equal(p.state.destroyed, 1);
      assert.equal(p.state.fetches, 0);
    }
    groups++;
    for (const mode of [
      'normal',
      'foreign-origin',
      'duplicate-param',
      'wrong-expiry',
      'redirect',
      'oversized-response',
      'unknown-length-oversized',
      'wrong-content',
      'missing-config',
      'stage',
    ]) {
      const p = provider(mode);
      if (mode === 'normal') {
        const r = await p.module.downloadPrivateDocument(base, p.fetchImpl);
        assert.equal(r.buffer.toString(), pdf.toString());
        assert.equal(r.extension, 'pdf');
      } else
        await assert.rejects(() =>
          p.module.downloadPrivateDocument(base, p.fetchImpl)
        );
      if (
        ['redirect', 'oversized-response', 'unknown-length-oversized'].includes(
          mode
        )
      ) {
        assert.equal(p.state.aborted, true);
        assert.equal(p.state.cancelled, 1);
      }
      if (
        [
          'foreign-origin',
          'duplicate-param',
          'wrong-expiry',
          'missing-config',
          'stage',
        ].includes(mode)
      )
        assert.equal(p.state.fetches, 0);
    }
    groups++;

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/rN8AAAAASUVORK5CYII=',
      'base64'
    );
    const imageProvider = provider();
    await imageProvider.module.uploadPrivateDocument(
      png,
      'image/png',
      sellerId,
      id
    );
    assert.equal(imageProvider.state.options.resource_type, 'image');
    assert.equal(imageProvider.state.options.type, 'authenticated');
    const imageRecord = {
      ...base,
      mime: 'image/png',
      bytes: png.length,
      resourceType: 'image',
      publicId: docs.documentLocation(sellerId, id, 'image/png').publicId,
    };
    const image = await imageProvider.module.downloadPrivateDocument(
      imageRecord,
      async () => new Response(Uint8Array.from(png))
    );
    assert.equal(image.mime, 'image/png');
    assert.equal(image.extension, 'png');
    groups++;

    for (const flag of [undefined, 'false', 'TRUE', '1', 'true']) {
      for (const isolated of [undefined, '1']) {
        const gate = loadRoute<
          typeof import('../lib/seller-document-provider')
        >(
          'lib/seller-document-provider.ts',
          {
            './cloudinary': { cloudinary: {} },
            'node:https': { Agent: https.Agent },
            './deployment-policy': { assertProviderAllowed: () => {} },
            './seller-documents': docs,
          },
          {
            globals: {
              ...globals,
              process: {
                env: {
                  SELLER_DOCUMENT_COLLECTION_ENABLED: flag,
                  KK_ISOLATED: isolated,
                },
              },
              fetch: () => {
                throw Error('Network forbidden');
              },
            },
          }
        );
        if (flag === 'true' && isolated !== '1')
          assert.doesNotThrow(() => gate.assertDocumentCollectionEnabled());
        else assert.throws(() => gate.assertDocumentCollectionEnabled());
      }
    }
    groups++;

    for (const extraEnv of [
      { SELLER_DOCUMENT_COLLECTION_ENABLED: undefined },
      { SELLER_DOCUMENT_COLLECTION_ENABLED: 'false' },
      { SELLER_DOCUMENT_COLLECTION_ENABLED: 'true', KK_ISOLATED: '1' },
    ]) {
      const denied = provider('normal', extraEnv);
      await assert.rejects(() =>
        denied.module.uploadPrivateDocument(
          pdf,
          'application/pdf',
          sellerId,
          id
        )
      );
      assert.equal(denied.state.uploads, 0);
      const existing = await denied.module.downloadPrivateDocument(
        base,
        denied.fetchImpl
      );
      assert.equal(existing.mime, 'application/pdf');
      assert.equal(denied.state.fetches, 1);
    }
    const staged = provider('stage');
    await assert.rejects(() =>
      staged.module.uploadPrivateDocument(pdf, 'application/pdf', sellerId, id)
    );
    assert.equal(staged.state.uploads, 0);
    groups++;

    const originalRequest = https.request;
    let actualSdkRequests = 0,
      stallUpload = false,
      ownedSocketDestructions = 0;
    const transportCalls: Record<string, unknown>[] = [];
    const transportRequests: Writable[] = [];
    https.request = ((
      options: Record<string, unknown>,
      callback: (response: unknown) => void
    ) => {
      actualSdkRequests++;
      transportCalls.push(options);
      const agent = options.agent as InstanceType<typeof https.Agent>;
      assert.ok(agent instanceof https.Agent);
      assert.notEqual(agent, https.globalAgent);
      assert.equal(agent.options.rejectUnauthorized, true);
      assert.equal(agent.options.keepAlive, false);
      const request = new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      }) as Writable & { setTimeout: () => unknown; abort: () => void };
      transportRequests.push(request);
      request.setTimeout = () => request;
      request.abort = () => request.destroy();
      let destroyed = false;
      (agent.sockets as Record<string, import('node:net').Socket[]>)[
        'synthetic:443:'
      ] = [
        {
          destroy() {
            if (destroyed) return;
            destroyed = true;
            ownedSocketDestructions++;
            if (stallUpload)
              request.destroy(Error('Synthetic owned socket aborted'));
          },
        } as unknown as import('node:net').Socket,
      ];
      request.on('finish', () => {
        if (stallUpload) return;
        const response = new PassThrough() as PassThrough & {
          statusCode: number;
          headers: object;
        };
        response.statusCode = 200;
        response.headers = {};
        callback(response);
        response.end(
          JSON.stringify({
            public_id: base.publicId,
            resource_type: 'raw',
            type: 'authenticated',
            bytes: pdf.length,
          })
        );
      });
      return request;
    }) as unknown as typeof https.request;
    try {
      const actual = loadRoute<
        typeof import('../lib/seller-document-provider')
      >(
        'lib/seller-document-provider.ts',
        {
          './cloudinary': { cloudinary: sdk },
          'node:https': { Agent: https.Agent },
          './deployment-policy': { assertProviderAllowed: () => {} },
          './seller-documents': docs,
        },
        {
          globals: {
            ...globals,
            setTimeout: (fn: () => void, delay: number) =>
              setTimeout(fn, Math.min(delay, 40)),
            process: {
              env: {
                NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'synthetic-cloud',
                CLOUDINARY_API_KEY: '123',
                CLOUDINARY_API_SECRET: 'test-only-scoped-key',
                SELLER_DOCUMENT_COLLECTION_ENABLED: 'true',
              },
            },
            fetch: () => {
              throw Error('Network forbidden');
            },
          },
        }
      );
      sdk.config({ oauth_token: 'synthetic-inherited-oauth' });
      await assert.rejects(() =>
        actual.uploadPrivateDocument(pdf, 'application/pdf', sellerId, id)
      );
      assert.equal(actualSdkRequests, 0);
      sdk.config({
        oauth_token: undefined,
        api_proxy: 'http://synthetic-proxy.invalid',
      });
      await assert.rejects(() =>
        actual.uploadPrivateDocument(pdf, 'application/pdf', sellerId, id)
      );
      assert.equal(actualSdkRequests, 0);
      sdk.config({ api_proxy: undefined });
      await actual.uploadPrivateDocument(pdf, 'application/pdf', sellerId, id);
      assert.equal(actualSdkRequests, 1);
      assert.equal(
        (transportCalls[0].headers as Record<string, unknown>).Authorization,
        undefined
      );
      assert.equal(ownedSocketDestructions, 1);
      stallUpload = true;
      await assert.rejects(() =>
        actual.uploadPrivateDocument(pdf, 'application/pdf', sellerId, id)
      );
      assert.equal(actualSdkRequests, 2);
      assert.equal(ownedSocketDestructions, 2);
      assert.equal(transportRequests[1].destroyed, true);
    } finally {
      https.request = originalRequest;
      sdk.config({ oauth_token: undefined, api_proxy: undefined });
    }
    groups++;

    async function downloadRoute(
      role: string | null,
      document: docs.DocumentRecord | null = base,
      requestedSeller = sellerId
    ) {
      const state = { provider: 0, queries: 0 };
      const route = loadRoute<{
        GET: (r: Request, c: unknown) => Promise<Response>;
      }>(
        'app/api/admin/sellers/[id]/documents/[documentId]/route.ts',
        {
          'next/server': { NextResponse: { json } },
          '@/lib/auth': {
            auth: async () =>
              role ? { user: { email: 'synthetic@example.invalid' } } : null,
          },
          '@/lib/prisma': {
            prisma: {
              user: { findUnique: async () => ({ role }) },
              sellerDocument: {
                findFirst: async ({
                  where,
                }: {
                  where: { id: string; sellerId: string };
                }) => {
                  state.queries++;
                  assert.equal(where.id, id);
                  assert.equal(where.sellerId, requestedSeller);
                  return document?.sellerId === where.sellerId
                    ? document
                    : null;
                },
              },
            },
          },
          '@/lib/csrf': { withCSRF: (h: unknown) => h },
          '@/lib/rateLimit': { withRateLimit: (_: unknown, h: unknown) => h },
          '@/lib/seller-documents': docs,
          '@/lib/seller-document-provider': {
            downloadPrivateDocument: async () => {
              state.provider++;
              return { buffer: pdf, mime: 'application/pdf', extension: 'pdf' };
            },
          },
        },
        { globals }
      );
      return {
        response: await route.GET(new Request('http://local.invalid'), {
          params: Promise.resolve({ id: requestedSeller, documentId: id }),
        }),
        state,
      };
    }
    for (const role of [null, 'BUYER', 'SELLER']) {
      const r = await downloadRoute(role);
      assert.equal(r.response.status, role ? 403 : 401);
      assert.equal(r.state.provider, 0);
      assert.equal(r.state.queries, 0);
    }
    groups++;
    for (const [document, seller] of [
      [base, 'other-seller'],
      [{ ...base, deliveryType: null }, sellerId],
      [{ ...base, publicId: 'arbitrary' }, sellerId],
    ] as const) {
      const r = await downloadRoute('ADMIN', document, seller);
      assert.ok([404, 409].includes(r.response.status));
      assert.equal(r.state.provider, 0);
    }
    groups++;
    const allowed = await downloadRoute('ADMIN');
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.state.provider, 1);
    assert.equal(
      allowed.response.headers.get('cache-control'),
      'private, no-store'
    );
    assert.equal(
      allowed.response.headers.get('x-content-type-options'),
      'nosniff'
    );
    assert.equal(
      allowed.response.headers.get('referrer-policy'),
      'no-referrer'
    );
    assert.ok(
      allowed.response.headers
        .get('content-disposition')
        ?.startsWith('attachment;')
    );
    assert.equal(await allowed.response.text(), pdf.toString());
    groups++;

    async function uploadRoute(mode: string) {
      const state = {
        body: 0,
        reserved: 0,
        uploaded: 0,
        finalized: 0,
        failed: 0,
      };
      const route = loadRoute<{ POST: (r: Request) => Promise<Response> }>(
        'app/api/seller/documents/upload/route.ts',
        {
          'next/server': { NextResponse: { json } },
          '@/lib/auth': {
            auth: async () =>
              mode === 'anonymous'
                ? null
                : { user: { email: 'synthetic@example.invalid' } },
          },
          '@/lib/prisma': {
            prisma: {
              user: {
                findUnique: async () => ({
                  id: 'user',
                  role: mode === 'buyer' ? 'BUYER' : 'SELLER',
                  sellerProfile: { id: sellerId },
                }),
              },
            },
          },
          '@/lib/csrf': { withCSRF: (h: unknown) => h },
          '@/lib/rateLimit': { withRateLimit: (_: unknown, h: unknown) => h },
          '@/lib/deployment-policy': {
            isStagingDeployment: () => mode === 'stage',
          },
          '@/lib/seller-documents': {
            ...docs,
            readDocumentFile: async () => {
              state.body++;
              return { buffer: pdf, mime: 'application/pdf' };
            },
          },
          '@/lib/seller-document-store': {
            reserveDocument: async () => {
              state.reserved++;
              return { id, sellerId };
            },
            finalizeDocument: async () => {
              state.finalized++;
              if (mode === 'metadata-failure')
                throw Error('private db/provider data');
            },
            failDocument: async () => {
              state.failed++;
            },
          },
          '@/lib/seller-document-provider': {
            assertDocumentCollectionEnabled: () => {
              if (mode === 'collection-disabled')
                throw new docs.SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
            },
            assertDocumentProviderConfigured: () => {
              if (mode === 'missing-config')
                throw new docs.SellerDocumentError('DOCUMENT_UNAVAILABLE', 503);
            },
            uploadPrivateDocument: async () => {
              state.uploaded++;
              if (mode === 'provider-failure')
                throw Error('private provider data');
            },
          },
        },
        { globals }
      );
      return {
        response: await route.POST(
          new Request('http://local.invalid', { method: 'POST' })
        ),
        state,
      };
    }
    for (const mode of ['anonymous', 'buyer', 'stage', 'missing-config']) {
      const r = await uploadRoute(mode);
      assert.equal(r.state.body, 0);
      assert.equal(r.state.reserved, 0);
      assert.equal(r.state.uploaded, 0);
      assert.ok(r.response.status >= 400);
      assert.equal(
        r.response.headers.get('cache-control'),
        'private, no-store'
      );
    }
    groups++;
    for (const mode of ['provider-failure', 'metadata-failure']) {
      const r = await uploadRoute(mode);
      assert.equal(r.response.status, 503);
      assert.equal(r.state.failed, 1);
      const text = await r.response.text();
      assert.ok(!text.includes('private'));
      assert.ok(!text.includes('document'));
      assert.ok(!text.includes('url'));
    }
    groups++;
    const upload = await uploadRoute('normal');
    assert.equal(upload.response.status, 200);
    assert.deepEqual(await upload.response.json(), {
      success: true,
      document: { id, mime: 'application/pdf', bytes: pdf.length },
    });
    assert.equal(upload.state.finalized, 1);
    assert.equal(upload.state.failed, 0);
    groups++;

    const listRoute = loadRoute<{
      GET: (request: Request, context: unknown) => Promise<Response>;
    }>(
      'app/api/admin/sellers/[id]/documents/route.ts',
      {
        'next/server': { NextResponse: { json } },
        '@/lib/auth': {
          auth: async () => ({ user: { email: 'synthetic@example.invalid' } }),
        },
        '@/lib/prisma': {
          prisma: {
            user: { findUnique: async () => ({ role: 'ADMIN' }) },
            sellerProfile: {
              findUnique: async () => ({
                docsFolder: 'private-old-folder',
                _count: { documents: 1 },
                documents: [
                  {
                    ...base,
                    publicId: 'private-old-publicid',
                    url: 'https://outside.invalid/private-old-url',
                    deliveryType: null,
                    status: null,
                  },
                ],
              }),
            },
          },
        },
        '@/lib/csrf': { withCSRF: (h: unknown) => h },
        '@/lib/rateLimit': { withRateLimit: (_: unknown, h: unknown) => h },
        '@/lib/seller-documents': docs,
      },
      { globals }
    );
    const listed = await listRoute.GET(new Request('http://local.invalid'), {
      params: Promise.resolve({ id: sellerId }),
    });
    const listedText = await listed.text();
    for (const privateValue of [
      'private-old-folder',
      'private-old-publicid',
      'private-old-url',
      'outside.invalid',
    ])
      assert.ok(!listedText.includes(privateValue));
    const listedValue = JSON.parse(listedText);
    assert.equal(listedValue.legacyReconciliationRequired, true);
    assert.equal(listedValue.documents[0].available, false);
    assert.equal(listedValue.documents[0].downloadPath, null);
    assert.equal(listed.headers.get('cache-control'), 'private, no-store');
    for (const role of [null, 'BUYER', 'SELLER']) {
      let privateReads = 0;
      const deniedList = loadRoute<{
        GET: (r: Request, c: unknown) => Promise<Response>;
      }>(
        'app/api/admin/sellers/[id]/documents/route.ts',
        {
          'next/server': { NextResponse: { json } },
          '@/lib/auth': {
            auth: async () =>
              role
                ? {
                    user: { email: 'synthetic@example.invalid', role: 'ADMIN' },
                  }
                : null,
          },
          '@/lib/prisma': {
            prisma: {
              user: { findUnique: async () => ({ role }) },
              sellerProfile: {
                findUnique: async () => {
                  privateReads++;
                  throw Error('must not read');
                },
              },
            },
          },
          '@/lib/csrf': { withCSRF: (h: unknown) => h },
          '@/lib/rateLimit': { withRateLimit: (_: unknown, h: unknown) => h },
          '@/lib/seller-documents': docs,
        },
        { globals }
      );
      const r = await deniedList.GET(new Request('http://local.invalid'), {
        params: Promise.resolve({ id: sellerId }),
      });
      assert.equal(r.status, role ? 403 : 401);
      assert.equal(privateReads, 0);
      assert.equal(r.headers.get('cache-control'), 'private, no-store');
    }
    groups++;

    for (const submitted of [
      [id],
      ['pending-id'],
      ['foreign-id'],
      ['legacy-id'],
    ]) {
      let writes = 0,
        fingerprinted = 0,
        ownershipChecks = 0;
      const completion = loadRoute<{
        POST: (request: Request) => Promise<Response>;
      }>(
        'app/api/seller/onboarding/complete/route.ts',
        {
          'next/server': { NextResponse: { json } },
          '@/lib/auth': {
            auth: async () => ({
              user: { email: 'synthetic@example.invalid' },
            }),
          },
          '@/lib/prisma': {
            prisma: {
              user: {
                findUnique: async () => ({
                  id: 'synthetic-user',
                  role: 'SELLER',
                  sellerProfile: { id: sellerId, nationalIdHash: null },
                }),
              },
              sellerProfile: {
                updateMany: async () => {
                  writes++;
                  return { count: 1 };
                },
              },
            },
          },
          '@/lib/csrf': { withCSRF: (h: unknown) => h },
          '@/lib/rateLimit': { withRateLimit: (_: unknown, h: unknown) => h },
          '@/lib/deployment-policy': { isStagingDeployment: () => false },
          '@/lib/identity-fingerprint': {
            fingerprintNationalId: () => {
              fingerprinted++;
              return 'synthetic-fingerprint';
            },
            IdentityKeyError: class extends Error {},
          },
          '@/lib/json-input': jsonInput,
          '@/lib/seller-onboarding-input': onboardingInput,
          '@/lib/seller-documents': docs,
          '@/lib/seller-document-store': {
            ownedReadyDocuments: async (profile: string, ids: string[]) => {
              ownershipChecks++;
              assert.equal(profile, sellerId);
              assert.equal(ids[0], submitted[0]);
              if (ids[0] !== id)
                throw new docs.SellerDocumentError('DOCUMENT_INVALID');
              return [base];
            },
          },
        },
        { globals }
      );
      const response = await completion.POST(
        new Request('http://local.invalid', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            shopName: 'Synthetic shop',
            displayName: 'Synthetic seller',
            bio: 'Synthetic handmade shop description',
            phone: '09120000000',
            province: 'Synthetic',
            city: 'Synthetic city',
            address: 'Synthetic address for tests',
            nationalId: '0123456789',
            uploadedDocs: submitted,
          }),
        })
      );
      assert.equal(ownershipChecks, 1);
      assert.equal(response.status, submitted[0] === id ? 200 : 400);
      assert.equal(writes, submitted[0] === id ? 1 : 0);
      assert.equal(fingerprinted, writes);
    }
    groups++;

    const emitted: DocumentReviewState[] = [];
    const pending: {
      resolve: (r: Response) => void;
      signal?: AbortSignal | null;
    }[] = [];
    const reviewLoader = createDocumentReviewLoader(
      ((_url, options) =>
        new Promise<Response>(resolve =>
          pending.push({ resolve, signal: options?.signal })
        )) as typeof fetch,
      state => emitted.push(state)
    );
    const reviewBody = (seller: string) =>
      json({
        documents: [
          {
            id,
            mime: 'application/pdf',
            bytes: 32,
            createdAt: new Date().toISOString(),
            available: true,
            downloadPath: `/api/admin/sellers/${seller}/documents/${id}`,
          },
        ],
        legacyReconciliationRequired: false,
      });
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    reviewLoader.select('seller-a', true);
    pending[0].resolve(reviewBody('seller-a'));
    await flush();
    assert.equal(emitted.at(-1)?.sellerId, 'seller-a');
    reviewLoader.select(null, false);
    assert.deepEqual(emitted.at(-1)?.documents, []);
    reviewLoader.select('seller-b', true);
    assert.deepEqual(
      documentReviewForSeller('seller-b', emitted[0]).documents,
      []
    );
    assert.equal(emitted.at(-1)?.loading, true);
    reviewLoader.select('seller-c', true);
    assert.equal(pending[1].signal?.aborted, true);
    pending[1].resolve(reviewBody('seller-b'));
    pending[2].resolve(reviewBody('seller-c'));
    await flush();
    assert.equal(emitted.at(-1)?.sellerId, 'seller-c');
    assert.ok(
      emitted.at(-1)?.documents[0].downloadPath?.includes('/seller-c/')
    );
    reviewLoader.dispose();
    groups++;

    const storedProfile = {
      id: sellerId,
      userId: 'synthetic-user',
      docsFolder: 'private-preserved-folder',
      shopName: 'Synthetic shop',
    };
    const profileRoute = loadRoute<{
      GET: () => Promise<Response>;
      PUT: (r: Request) => Promise<Response>;
    }>(
      'app/api/seller/profile/route.ts',
      {
        'next/server': { NextResponse: { json } },
        '@/lib/auth': {
          auth: async () => ({
            user: { email: 'synthetic@example.invalid', role: 'SELLER' },
          }),
        },
        '@/lib/prisma': {
          prisma: {
            user: {
              findUnique: async () => ({
                id: 'synthetic-user',
                name: 'Synthetic seller',
                email: 'synthetic@example.invalid',
                createdAt: new Date(),
                sellerProfile: storedProfile,
              }),
              update: async () => ({}),
            },
            sellerProfile: { upsert: async () => storedProfile },
          },
        },
        '@/lib/rateLimit': { withRateLimit: (_: unknown, h: unknown) => h },
        '@/lib/cache': {
          revalidateSeller: async () => {},
          revalidateProductsForSeller: async () => {},
        },
        zod: { z },
        '@sentry/nextjs': { setUser: () => {} },
        '@/lib/csrf': { withCSRF: (h: unknown) => h },
      },
      { globals }
    );
    for (const result of [
      await profileRoute.GET(),
      await profileRoute.PUT(
        new Request('http://local.invalid', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayName: 'Synthetic seller' }),
        })
      ),
    ]) {
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.equal(body.sellerProfile.id, sellerId);
      assert.equal(Object.hasOwn(body.sellerProfile, 'docsFolder'), false);
    }
    assert.equal(storedProfile.docsFolder, 'private-preserved-folder');
    groups++;

    assert.equal(actualNetworkCalls, 0);
    console.log(
      `Seller document security: ${groups} groups passed (synthetic providers; no network).`
    );
  } finally {
    net.Socket.prototype.connect = connect;
    tls.connect = secure;
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
