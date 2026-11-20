import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import * as imageInput from '../lib/product-image-input';
import { isStagingDeployment } from '../lib/deployment-policy';
import { loadRoute } from './helpers/load-route';

const { ProductImageInputError, readImageMultipart, readProductImage } =
  imageInput;
const url = 'https://uploads.example.invalid/';
const jpegType = 'image/jpeg';
const pngType = 'image/png';
const webpType = 'image/webp';
const image = (bytes: Buffer<ArrayBuffer>, type: string) =>
  new File([bytes], 'synthetic-image', { type });

const inputStatus = (status: number) => (error: unknown) =>
  error instanceof ProductImageInputError && error.status === status;

function multipart(name: string, files: (File | string)[]) {
  const data = new FormData();
  for (const file of files) data.append(name, file);
  return data;
}

function request(body: FormData) {
  return new Request(url, { method: 'POST', body });
}

function animatedPng(png: Buffer<ArrayBuffer>) {
  function chunk(type: string, data: Buffer<ArrayBuffer>) {
    const bytes = Buffer.alloc(data.length + 12);
    bytes.writeUInt32BE(data.length);
    bytes.write(type, 4, 4, 'ascii');
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
    return bytes;
  }
  function frame(sequence: number) {
    const control = Buffer.alloc(26);
    control.writeUInt32BE(sequence);
    png.copy(control, 4, 16, 24); // Width and height from IHDR.
    control.writeUInt16BE(1, 20);
    control.writeUInt16BE(10, 22);
    return chunk('fcTL', control);
  }
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2);
  const idat = png.indexOf('IDAT');
  assert.ok(idat > 33);
  const length = png.readUInt32BE(idat - 4);
  const second = Buffer.alloc(length + 4);
  second.writeUInt32BE(2);
  png.copy(second, 4, idat + 4, idat + 4 + length);
  return Buffer.concat([
    png.subarray(0, idat - 4),
    chunk('acTL', control),
    frame(0),
    png.subarray(idat - 4, idat + 8 + length),
    frame(1),
    chunk('fdAT', second),
    png.subarray(idat + 8 + length),
  ]);
}

async function checkMultipart(jpeg: File) {
  const makeHeaders = (length?: string) =>
    new Headers({
      'content-type': 'multipart/form-data; boundary=test-boundary',
      ...(length ? { 'content-length': length } : {}),
    });
  const signal = new AbortController().signal;
  const noRead = {
    headers: makeHeaders('10000000'),
    signal,
    get body(): Request['body'] {
      throw new Error('Declared oversized request accessed its body');
    },
  };
  await assert.rejects(readImageMultipart(noRead), inputStatus(413));
  await assert.rejects(
    readImageMultipart(
      new Request(url, { method: 'POST', body: 'not multipart' })
    ),
    inputStatus(415)
  );
  await assert.rejects(
    readImageMultipart(
      new Request(url, {
        method: 'POST',
        headers: makeHeaders(),
        body: 'invalid multipart',
      })
    ),
    inputStatus(400)
  );

  let canceled = 0;
  const oversized = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      const chunk = new Uint8Array(1024 * 1024);
      for (let i = 0; i < 6; i++) controller.enqueue(chunk);
    },
    cancel() {
      canceled++;
      return new Promise(() => {});
    },
  });
  await assert.rejects(
    readImageMultipart({ body: oversized, headers: makeHeaders('1'), signal }),
    inputStatus(413)
  );
  assert.equal(canceled, 1);
  assert.equal(oversized.locked, false);

  const deadline = new AbortController();
  const stalled = new ReadableStream<Uint8Array<ArrayBuffer>>({
    cancel() {
      canceled++;
    },
  });
  const pending = readImageMultipart(
    { body: stalled, headers: makeHeaders(), signal },
    deadline.signal
  );
  deadline.abort();
  await assert.rejects(pending, inputStatus(400));
  assert.equal(canceled, 2);
  assert.equal(stalled.locked, false);

  const parsed = await readImageMultipart(request(multipart('file', [jpeg])));
  assert.deepEqual(
    await readProductImage(parsed.get('file')),
    Buffer.from(await jpeg.arrayBuffer())
  );
}

function entryPoints(
  options: {
    staging?: boolean;
    preview?: boolean;
    signedIn?: boolean;
    owned?: boolean;
    failProvider?: boolean;
    blockedRate?: boolean;
  } = {}
) {
  const calls = {
    auth: 0,
    rateLimit: 0,
    persist: 0,
    revalidate: 0,
    sent: [] as Buffer[],
  };
  const session = {
    user: { email: 'synthetic@example.invalid', role: 'SELLER' },
  };
  const context = { params: Promise.resolve({ id: 'product-test' }) };
  const uploadResult = {
    public_id: 'image-test',
    secure_url: 'https://images.example.invalid/photo',
    width: 4,
    height: 4,
    format: 'jpeg',
    bytes: 413,
  };
  async function upload(buffer: Buffer) {
    calls.sent.push(buffer);
    if (options.failProvider) throw new Error('internal-provider-message');
    return uploadResult;
  }
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (data: unknown, options?: { status: number }) =>
          Response.json(data, options),
      },
    },
    'next/cache': {
      revalidateTag() {
        calls.revalidate++;
      },
    },
    '@/lib/deployment-policy': {
      isStagingDeployment: () =>
        isStagingDeployment({
          KK_DEPLOYMENT_MODE: options.staging ? 'staging' : undefined,
          VERCEL_ENV: options.preview ? 'preview' : undefined,
        }),
    },
    '@/lib/auth': {
      async auth() {
        calls.auth++;
        return options.signedIn === false ? null : session;
      },
    },
    '@/lib/csrf': {
      validateCSRF: () => true,
      withCSRF: (handler: unknown) => handler,
    },
    '@/lib/rateLimit': {
      uploadRateLimit: {},
      withRateLimit:
        (_limit: unknown, handler: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) => {
          calls.rateLimit++;
          return options.blockedRate
            ? Response.json({ error: 'Rate limit exceeded' }, { status: 429 })
            : handler(...args);
        },
    },
    '@/lib/product-image-input': imageInput,
    '@/lib/product-image-order': {},
    '@/lib/cloudinary': {
      UPLOAD_FOLDER: 'kiarakraft',
      uploadImageToCloudinary: upload,
      cloudinary: {
        uploader: {
          upload_stream(
            _options: unknown,
            callback: (error: unknown, result?: typeof uploadResult) => void
          ) {
            return {
              end: (bytes: Buffer) => {
                void upload(bytes).then(
                  value => callback(null, value),
                  error => callback(error)
                );
              },
            };
          },
        },
      },
    },
    '@/lib/prisma': {
      prisma: {
        user: {
          findUnique: async () => ({
            role: 'SELLER',
            sellerProfile: { id: 'seller-test' },
          }),
        },
        product: {
          findUnique: async () => ({
            id: 'product-test',
            sellerId: options.owned === false ? 'other-seller' : 'seller-test',
          }),
          findFirst: async ({ where }: { where: Record<string, string> }) => {
            assert.equal(where.sellerId, 'seller-test');
            assert.equal(where.id, 'product-test');
            return options.owned === false ? null : { title: 'Sample' };
          },
        },
        listingImage: {
          count: async () => 0,
          findFirst: async () => null,
          async create({ data }: { data: Record<string, unknown> }) {
            assert.equal(data.productId, 'product-test');
            calls.persist++;
            return { id: 'image-test', ...data };
          },
        },
      },
    },
  };
  const create = loadRoute<{ POST(request: Request): Promise<Response> }>(
    'app/api/upload/image/route.ts',
    dependencies,
    {
      env: {
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'test',
        CLOUDINARY_API_KEY: 'test',
        CLOUDINARY_API_SECRET: 'test',
      },
    }
  );
  const batch = loadRoute<{
    POST(request: Request, routeContext: typeof context): Promise<Response>;
  }>('app/api/seller/products/[id]/images/route.ts', dependencies);
  const edit = loadRoute<{
    uploadProductImage(
      data: FormData
    ): Promise<{ success: boolean; error?: string; status?: number }>;
  }>('lib/actions/upload.ts', dependencies);
  const editBody = (file: File | string) => {
    const data = multipart('file', [file]);
    data.append('productId', 'product-test');
    return data;
  };
  return {
    calls,
    create: create.POST,
    batch: (request: Request) => batch.POST(request, context),
    edit: edit.uploadProductImage,
    editBody,
  };
}

async function checkEntryPoints(jpeg: File, badJpeg: File) {
  const unreadable = new Request(url, { method: 'POST' });
  for (const field of ['headers', 'body']) {
    Object.defineProperty(unreadable, field, {
      get() {
        throw new Error('Upload denial read upload input');
      },
    });
  }
  for (const mode of [{ staging: true }, { preview: true }]) {
    const entry = entryPoints(mode);
    assert.equal((await entry.create(unreadable)).status, 403);
    assert.equal((await entry.batch(unreadable)).status, 403);
    assert.equal(
      (await entry.edit(null as unknown as FormData)).error,
      'Image uploads are disabled in staging'
    );
    assert.deepEqual(entry.calls, {
      auth: 0,
      rateLimit: 0,
      persist: 0,
      revalidate: 0,
      sent: [],
    });
  }

  const blocked = entryPoints({ blockedRate: true });
  assert.equal((await blocked.create(unreadable)).status, 429);
  assert.equal((await blocked.batch(unreadable)).status, 429);
  assert.equal(blocked.calls.rateLimit, 2);
  assert.equal(blocked.calls.auth, 0);
  assert.equal(blocked.calls.sent.length, 0);

  const anonymous = entryPoints({ signedIn: false });
  assert.equal((await anonymous.create(unreadable)).status, 401);
  assert.equal((await anonymous.batch(unreadable)).status, 401);
  assert.equal(
    (await anonymous.edit(null as unknown as FormData)).error,
    'Unauthorized'
  );
  assert.equal(anonymous.calls.sent.length, 0);

  const foreign = entryPoints({ owned: false });
  assert.equal((await foreign.batch(unreadable)).status, 404);
  assert.equal((await foreign.edit(foreign.editBody(jpeg))).success, false);
  assert.equal(foreign.calls.persist, 0);
  assert.equal(foreign.calls.sent.length, 0);

  const entry = entryPoints();
  assert.equal(
    (await entry.create(request(multipart('file', [jpeg, jpeg])))).status,
    400
  );
  assert.equal(
    (await entry.create(request(multipart('file', ['text'])))).status,
    400
  );
  assert.equal(
    (await entry.batch(request(multipart('files', [jpeg, badJpeg])))).status,
    415
  );
  assert.equal(
    (await entry.batch(request(multipart('files', Array<File>(6).fill(jpeg)))))
      .status,
    400
  );
  const rejectedEdit = await entry.edit(entry.editBody(badJpeg));
  assert.equal(rejectedEdit.success, false);
  assert.equal(rejectedEdit.status, 415);
  assert.equal(entry.calls.persist, 0);
  assert.equal(entry.calls.sent.length, 0);

  const created = await entry.create(request(multipart('file', [jpeg])));
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), {
    success: true,
    url: 'https://images.example.invalid/photo',
    publicId: 'image-test',
    width: 4,
    height: 4,
    format: 'jpeg',
    size: 413,
  });
  const batchResult = await entry.batch(
    request(multipart('files', [jpeg, jpeg]))
  );
  assert.equal(batchResult.status, 200);
  assert.equal((await batchResult.json()).images.length, 2);
  assert.equal((await entry.edit(entry.editBody(jpeg))).success, true);
  assert.deepEqual(
    entry.calls.sent,
    Array<Buffer>(4).fill(Buffer.from(await jpeg.arrayBuffer()))
  );
  assert.equal(entry.calls.persist, 3);
  assert.equal(entry.calls.revalidate, 2);

  const failed = entryPoints({ failProvider: true });
  assert.equal(
    (await failed.edit(failed.editBody(jpeg))).error,
    'Upload failed'
  );
  assert.equal(failed.calls.persist, 0);
}

async function main() {
  const fixture = sharp({
    create: { width: 4, height: 4, channels: 3, background: '#1b4a34' },
  });
  const jpeg = await fixture.clone().jpeg().toBuffer();
  const png = await fixture.clone().png().toBuffer();
  const webp = await fixture.clone().webp().toBuffer();
  for (const [bytes, mediaType] of [
    [jpeg, jpegType],
    [jpeg, 'image/jpg'],
    [png, pngType],
    [webp, webpType],
  ] as const) {
    assert.deepEqual(await readProductImage(image(bytes, mediaType)), bytes);
  }
  await assert.rejects(
    readProductImage(image(png, jpegType)),
    inputStatus(415)
  );
  await assert.rejects(
    readProductImage(image(png, 'image/gif')),
    inputStatus(415)
  );
  await assert.rejects(
    readProductImage(new File([], 'empty', { type: pngType })),
    inputStatus(400)
  );
  await assert.rejects(
    readProductImage(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large', {
        type: pngType,
      })
    ),
    inputStatus(413)
  );
  const truncated = jpeg.subarray(0, -2);
  assert.equal((await sharp(truncated).metadata()).format, 'jpeg');
  await assert.rejects(
    readProductImage(image(truncated, jpegType)),
    inputStatus(400)
  );

  const oversize = await sharp({
    create: { width: 6000, height: 4001, channels: 3, background: '#000' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    readProductImage(image(oversize, pngType)),
    inputStatus(400)
  );

  const frames = await sharp(
    Buffer.from([
      255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255,
      0, 0, 255, 0,
    ]),
    {
      raw: { width: 2, height: 4, pageHeight: 2, channels: 3 },
    }
  )
    .webp({ delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(frames).metadata()).pages, 2);
  await assert.rejects(
    readProductImage(image(frames, webpType)),
    inputStatus(400)
  );
  const apng = animatedPng(png);
  assert.equal((await sharp(apng).metadata()).format, 'png');
  await assert.rejects(
    readProductImage(image(apng, pngType)),
    inputStatus(400)
  );

  await checkMultipart(image(jpeg, jpegType));
  await checkEntryPoints(image(jpeg, jpegType), image(png, jpegType));
  console.log(
    'Product image bytes, multipart bounds, ownership, and provider boundaries passed'
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
