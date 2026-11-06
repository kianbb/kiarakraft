import {
  telemetryPrivacyOptions,
  redactTelemetryEvent,
} from '../lib/telemetry-policy';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Env = Record<string, string | undefined>;
const accidentalKeys = {
  RESEND_API_KEY: 'test-provider-key',
  SMTP_HOST: 'smtp.example.invalid',
  SMTP_USER: 'synthetic',
  SMTP_PASS: 'synthetic',
  CLOUDINARY_API_KEY: 'synthetic',
  CLOUDINARY_API_SECRET: 'synthetic',
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'synthetic',
  VAPID_PUBLIC_KEY: 'synthetic',
  VAPID_PRIVATE_KEY: 'synthetic',
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: 'synthetic.invalid',
};

function load<T>(
  filename: string,
  env: Env,
  dependencies: Record<string, unknown>
) {
  const policyCode = ts.transpileModule(
    readFileSync(
      new URL('../lib/deployment-policy.ts', import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const policy = {};
  runInNewContext(policyCode, { exports: policy, process: { env }, URL });
  const modules = {
    ...dependencies,
    './lib/telemetry-policy': {
      telemetryPrivacyOptions,
      redactTelemetryEvent,
    },
    './deployment-policy': policy,
    '@/lib/deployment-policy': policy,
    './lib/deployment-policy': policy,
    '../deployment-policy': policy,
  };
  const code = ts.transpileModule(
    readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename.replace(/\.mjs$/, '.ts'),
    }
  ).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected side-effect dependency: ${name}`);
      return modules[name as keyof typeof modules];
    },
    process: { env },
    Buffer,
    URL,
    setInterval: () => 0,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return exports as T;
}

function cloudinary(env: Env) {
  const calls = { config: 0, upload: 0, destroy: 0, resources: 0, sign: 0 };
  const provider = {
    config: () => {
      calls.config++;
    },
    uploader: {
      upload_stream: (
        _options: unknown,
        callback: (error: null, result: object) => void
      ) => {
        calls.upload++;
        return {
          end: () =>
            callback(null, {
              public_id: 'synthetic',
              secure_url: 'https://images.example.invalid/synthetic.png',
              width: 1,
              height: 1,
              format: 'png',
              bytes: 1,
            }),
        };
      },
      destroy: async () => {
        calls.destroy++;
        return { result: 'ok' };
      },
    },
    api: {
      resources: async () => {
        calls.resources++;
        return { resources: [] };
      },
    },
    utils: {
      api_sign_request: () => {
        calls.sign++;
        return 'synthetic-signature';
      },
    },
  };
  type Cloudinary = {
    cloudinary: typeof provider;
    uploadImageToCloudinary: (buffer: Buffer) => Promise<unknown>;
    deleteImageFromCloudinary: (id: string) => Promise<boolean>;
    listAssetsInFolder: (folder: string) => Promise<unknown[]>;
  };
  return {
    module: load<Cloudinary>('lib/cloudinary.ts', env, {
      cloudinary: { v2: provider },
    }),
    calls,
  };
}

function email(
  env: Env,
  failResend: boolean | 'resolved-error' | 'missing-id' = false
) {
  const calls = { resendInit: 0, smtpInit: 0, resend: 0, smtp: 0 };
  class Resend {
    constructor() {
      calls.resendInit++;
    }
    emails = {
      send: async () => {
        calls.resend++;
        if (failResend === true) throw new Error('Synthetic provider failure');
        if (failResend === 'resolved-error')
          return {
            data: null,
            error: { message: 'Synthetic provider rejection' },
          };
        if (failResend === 'missing-id') return { data: null, error: null };
        return { data: { id: 'synthetic-email' } };
      },
    };
  }
  const dependencies = {
    resend: { Resend },
    'smtp-mailer': {
      __esModule: true,
      default: {
        createTransport: () => {
          calls.smtpInit++;
          return {
            sendMail: async () => {
              calls.smtp++;
              return { messageId: 'synthetic-smtp' };
            },
          };
        },
      },
    },
  };
  return {
    module: load<{
      sendEmail: (
        options: object
      ) => Promise<{ success: boolean; provider?: string }>;
    }>('lib/email.ts', env, dependencies),
    calls,
  };
}

function notifications(env: Env) {
  const calls = { vapid: 0, push: 0, email: 0, reads: 0, subscription: 0 };
  const loadedModule = load<{
    sendNotification: (
      notification: object,
      channels?: string[]
    ) => Promise<Array<{ success: boolean }>>;
    subscribeToPush: (
      id: string,
      subscription: object
    ) => Promise<{ success: boolean }>;
    VAPID_PUBLIC_KEY_CLIENT?: string;
  }>('lib/notifications.ts', env, {
    '@/lib/prisma': {
      prisma: {
        user: {
          findUnique: async () => {
            calls.reads++;
            return { email: 'synthetic@example.invalid', name: 'Synthetic' };
          },
        },
        pushSubscription: {
          findMany: async () => {
            calls.reads++;
            return [
              {
                id: 'synthetic',
                endpoint: 'https://push.example.invalid',
                p256dh: 'synthetic',
                auth: 'synthetic',
              },
            ];
          },
          upsert: async () => {
            calls.subscription++;
          },
        },
        notificationLog: { create: async () => ({}) },
      },
    },
    '@/lib/email': {
      sendEmail: async () => {
        calls.email++;
        return { success: true };
      },
    },
    'web-push': {
      __esModule: true,
      default: {
        setVapidDetails: () => {
          calls.vapid++;
        },
        sendNotification: async () => {
          calls.push++;
        },
      },
    },
    '@/lib/security': {
      sanitizeText: (value: string) => value,
      sanitizeCustomerName: (value: string) => value,
      sanitizeNotificationData: (value: object) => value,
      filterSensitiveData: (value: object) => value,
      checkNotificationRateLimit: () => ({ allowed: true }),
    },
  });
  return { module: loadedModule, calls };
}

async function identityRoute(filename: string, env: Env) {
  const calls = { auth: 0, body: 0 };
  const route = load<{
    POST: (request: object) => Promise<{ status: number }>;
  }>(filename, env, {
    'next/server': {
      NextResponse: {
        json: (_data: unknown, options: { status: number }) => ({
          status: options.status,
        }),
      },
    },
    '@/lib/auth': {
      auth: async () => {
        calls.auth++;
        return null;
      },
    },
    '@/lib/prisma': { prisma: {} },
    '@/lib/cloudinary': {},
    '@/lib/file-validation': {},
    '@/lib/csrf': { withCSRF: (handler: unknown) => handler },
    '@/lib/rateLimit': {
      withRateLimit: (_config: unknown, handler: unknown) => handler,
    },
    '@sentry/nextjs': {},
    crypto: {},
  });
  const response = await route.POST({
    json: () => {
      calls.body++;
    },
    formData: () => {
      calls.body++;
    },
  });
  return { response, calls };
}

type Element = { type: unknown; props: Record<string, unknown> };

function renderedElements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(renderedElements);
  if (!value || typeof value !== 'object') return [];
  const element = value as Partial<Element>;
  if (!('type' in element) || !element.props) return [];
  return [element as Element, ...renderedElements(element.props.children)];
}

const renderingOrigin = 'https://layout.example.invalid';
function renderedResourceUrls(elements: Element[]): URL[] {
  return elements.flatMap(({ props }) => {
    const references = ['src', 'href'].flatMap(name =>
      typeof props[name] === 'string' ? [props[name] as string] : []
    );
    for (const name of ['srcSet', 'imageSrcSet']) {
      if (typeof props[name] !== 'string') continue;
      for (const candidate of (props[name] as string).split(',')) {
        const reference = candidate.trim().split(/\s+/)[0];
        if (reference) references.push(reference);
      }
    }
    return references.map(reference => new URL(reference, renderingOrigin));
  });
}

async function rendering(env: Env) {
  const jsx = (type: unknown, props: Record<string, unknown>) => ({
    type,
    props,
  });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next-intl/server': {
      getMessages: async () => ({}),
      getTranslations: async () => (key: string) => key,
      setRequestLocale: () => {},
    },
    '@/components/providers/Providers': { Providers: 'Providers' },
    '@/components/layout/Navbar': { __esModule: true, default: 'Navbar' },
    '@/components/layout/Footer': { __esModule: true, default: 'Footer' },
    '@/components/seo/StructuredData': { StructuredData: 'StructuredData' },
    '@/components/ServiceWorkerRegistration': {
      __esModule: true,
      default: 'ServiceWorker',
    },
    '@/components/PWAInstallPrompt': {
      __esModule: true,
      default: 'PWAInstall',
    },
    '@vercel/speed-insights/next': { SpeedInsights: 'TelemetrySpeed' },
    '@vercel/analytics/react': { Analytics: 'TelemetryAnalytics' },
    '@/lib/fonts': {
      inter: { variable: 'inter' },
      vazirmatn: { variable: 'vazirmatn' },
    },
  };
  const layout = load<{
    default: (props: object) => Promise<Element>;
    generateMetadata: (
      props: object
    ) => Promise<{ robots: { index: boolean; follow: boolean } }>;
  }>('app/[locale]/layout.tsx', env, dependencies);
  const props = {
    children: 'Synthetic content',
    params: Promise.resolve({ locale: 'fa' }),
  };
  const tree = await layout.default(props);
  const metadata = await layout.generateMetadata(props);
  const elements = renderedElements(tree);
  const robot = load<{
    default: () => { rules: { disallow?: string; allow?: string } };
  }>('app/robots.ts', env, {}).default();
  const config = load<{
    default: {
      env: { NEXT_PUBLIC_KK_STAGING: string };
      images: { remotePatterns: unknown[] };
      headers: () => Promise<
        Array<{ headers: Array<{ key: string; value: string }> }>
      >;
    };
  }>('next.config.mjs', env, {
    'next-intl/plugin': {
      __esModule: true,
      default: () => (value: unknown) => value,
    },
    '@sentry/nextjs': {},
  }).default;
  const headers = await config.headers();
  return {
    elementTypes: new Set(elements.map(element => element.type)),
    resourceUrls: renderedResourceUrls(elements),
    metadata,
    robot,
    config,
    noindex: headers.some(entry =>
      entry.headers.some(
        header =>
          header.key === 'X-Robots-Tag' &&
          header.value === 'noindex, nofollow, noarchive'
      )
    ),
  };
}

async function run() {
  const notice = {
    userId: 'synthetic-buyer',
    type: 'order_paid',
    data: { orderId: 'synthetic-order', locale: 'en' },
  };
  for (const mode of [
    { KK_DEPLOYMENT_MODE: 'staging' },
    { KK_DEPLOYMENT_MODE: 'staging', VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'preview' },
    { KK_DEPLOYMENT_MODE: 'production', VERCEL_ENV: 'preview' },
  ]) {
    const env: Env = { ...accidentalKeys, ...mode };
    const paymentAdapters = {
      './adapters/offline': { OfflineAdapter: 'synthetic-offline' },
      './adapters/zarinpalStub': { ZarinpalStub: 'synthetic-gateway' },
    };
    for (const gateway of [undefined, 'OFFLINE']) {
      assert.equal(
        load<{ adapter: string }>(
          'lib/payments/index.ts',
          { ...env, PAYMENT_GATEWAY: gateway },
          paymentAdapters
        ).adapter,
        'synthetic-offline'
      );
    }
    for (const gateway of ['ZARINPAL', 'unexpected']) {
      assert.throws(
        () =>
          load(
            'lib/payments/index.ts',
            { ...env, PAYMENT_GATEWAY: gateway },
            paymentAdapters
          ),
        /disabled in staging/
      );
    }
    const upload = cloudinary(env);
    assert.equal(upload.calls.config, 0);
    await assert.rejects(
      upload.module.uploadImageToCloudinary(Buffer.from('synthetic')),
      /disabled in staging/
    );
    assert.throws(
      () => upload.module.cloudinary.uploader.upload_stream({}, () => {}),
      /disabled in staging/
    );
    assert.throws(
      () => upload.module.cloudinary.api.resources(),
      /disabled in staging/
    );
    assert.throws(
      () => upload.module.cloudinary.utils.api_sign_request(),
      /disabled in staging/
    );
    assert.equal(
      await upload.module.deleteImageFromCloudinary('synthetic'),
      false
    );
    assert.equal(
      (await upload.module.listAssetsInFolder('synthetic')).length,
      0
    );
    assert.equal(
      Object.values(upload.calls).reduce((sum, count) => sum + count, 0),
      0
    );
    const mail = email(env);
    assert.equal(
      (
        await mail.module.sendEmail({
          to: 'synthetic@example.invalid',
          text: 'Synthetic',
          subject: 'Synthetic',
        })
      ).success,
      false
    );
    assert.equal(
      Object.values(mail.calls).reduce((sum, count) => sum + count, 0),
      0
    );
    const notification = notifications(env);
    assert.ok(
      (await notification.module.sendNotification(notice)).every(
        result => !result.success
      )
    );
    assert.equal(
      (await notification.module.subscribeToPush('synthetic', {})).success,
      false
    );
    assert.equal(notification.module.VAPID_PUBLIC_KEY_CLIENT, undefined);
    assert.equal(
      Object.values(notification.calls).reduce((sum, count) => sum + count, 0),
      0
    );
    for (const route of [
      'app/api/seller/documents/upload/route.ts',
      'app/api/seller/onboarding/complete/route.ts',
    ]) {
      const identity = await identityRoute(route, env);
      assert.equal(identity.response.status, 403);
      assert.equal(
        identity.calls.body + identity.calls.auth,
        0,
        'Identity routes must deny before reading a body or profile'
      );
    }
    const page = await rendering(env);
    assert.equal(page.elementTypes.has('TelemetrySpeed'), false);
    assert.equal(page.elementTypes.has('TelemetryAnalytics'), false);
    assert.ok(
      page.resourceUrls.every(url => url.origin === renderingOrigin),
      'Staging renders no external resource URLs or connection hints'
    );
    assert.equal(page.metadata.robots.index, false);
    assert.equal(page.metadata.robots.follow, false);
    assert.equal(page.robot.rules.disallow, '/');
    assert.equal(page.noindex, true);
    assert.equal(page.config.env.NEXT_PUBLIC_KK_STAGING, 'true');
    assert.equal(page.config.images.remotePatterns.length, 0);
    const headers = await page.config.headers();
    const csp = headers
      .flatMap(entry => entry.headers)
      .find(header => header.key === 'Content-Security-Policy')?.value;
    assert.ok(
      csp && !csp.includes('https://'),
      'Staging CSP permits no external image/telemetry destinations'
    );
    const assets = load<{
      CATEGORY_IMAGE_FALLBACKS: Record<string, string>;
      HERO_IMAGE: string;
    }>('lib/assets.ts', env, {});
    assert.equal(assets.HERO_IMAGE, '/kk-logo-original.png');
    assert.ok(
      Object.values(assets.CATEGORY_IMAGE_FALLBACKS).every(
        image => image === '/kk-logo-original.png'
      )
    );
    for (const filename of [
      'sentry.client.config.ts',
      'sentry.server.config.ts',
      'sentry.edge.config.ts',
    ]) {
      let init = 0;
      load(
        filename,
        {
          ...env,
          NEXT_PUBLIC_KK_STAGING: page.config.env.NEXT_PUBLIC_KK_STAGING,
          SENTRY_DSN: 'https://synthetic@example.invalid/1',
        },
        {
          './lib/telemetry-policy': {
            telemetryPrivacyOptions,
            redactTelemetryEvent,
          },
          '@sentry/nextjs': {
            init: () => {
              init++;
            },
            httpIntegration: () => ({}),
          },
        }
      );
      assert.equal(
        init,
        0,
        `${filename} must not initialize a telemetry transport`
      );
    }
  }
  const normal: Env = {
    ...accidentalKeys,
    VERCEL_ENV: 'production',
    KK_DEPLOYMENT_MODE: 'production',
  };
  const upload = cloudinary(normal);
  await upload.module.uploadImageToCloudinary(Buffer.from('synthetic'));
  assert.equal(upload.calls.config, 1);
  assert.equal(upload.calls.upload, 1);
  assert.equal(
    await upload.module.deleteImageFromCloudinary('synthetic'),
    true
  );
  await upload.module.listAssetsInFolder('synthetic');
  assert.equal(upload.calls.resources, 2);
  normal.VERCEL_ENV = 'preview';
  await assert.rejects(
    upload.module.uploadImageToCloudinary(Buffer.from('synthetic')),
    /disabled in staging/
  );
  assert.equal(
    upload.calls.upload,
    1,
    'A previously initialized SDK cannot bypass a changed staging policy'
  );
  const mail = email({ ...accidentalKeys });
  assert.equal(
    (
      await mail.module.sendEmail({
        to: 'synthetic@example.invalid',
        text: 'Synthetic',
        subject: 'Synthetic',
      })
    ).provider,
    'resend'
  );
  const fallback = email({ ...accidentalKeys }, true);
  assert.equal(
    (
      await fallback.module.sendEmail({
        to: 'synthetic@example.invalid',
        text: 'Synthetic',
        subject: 'Synthetic',
      })
    ).provider,
    'smtp'
  );
  for (const mode of ['resolved-error', 'missing-id'] as const) {
    const rejected = email({ ...accidentalKeys }, mode);
    const options = {
      to: 'synthetic@example.invalid',
      text: 'Synthetic',
      subject: 'Synthetic',
    };
    assert.equal((await rejected.module.sendEmail(options)).provider, 'smtp');
    assert.equal(rejected.calls.smtp, 1);
    const noFallback = email(
      { RESEND_API_KEY: accidentalKeys.RESEND_API_KEY },
      mode
    );
    assert.equal((await noFallback.module.sendEmail(options)).success, false);
    assert.equal(noFallback.calls.smtp, 0);
  }
  const normalPush = notifications({ ...accidentalKeys });
  assert.equal(
    (await normalPush.module.sendNotification(notice, ['push']))[0].success,
    true
  );
  assert.equal(normalPush.calls.push, 1);
  const normalPage = await rendering({ ...accidentalKeys });
  assert.equal(normalPage.elementTypes.has('TelemetrySpeed'), true);
  assert.equal(normalPage.elementTypes.has('TelemetryAnalytics'), true);
  assert.ok(
    normalPage.resourceUrls.some(
      url => url.href === 'https://plausible.io/js/script.js'
    ),
    'Ordinary rendering retains the exact analytics script URL'
  );
  assert.deepEqual(
    new Set(
      normalPage.resourceUrls
        .filter(url => url.origin !== renderingOrigin)
        .map(url => url.origin)
    ),
    new Set([
      'https://plausible.io',
      'https://res.cloudinary.com',
      'https://images.unsplash.com',
    ])
  );
  assert.equal(normalPage.metadata.robots.index, true);
  assert.equal(normalPage.noindex, false);
  assert.equal(normalPage.config.env.NEXT_PUBLIC_KK_STAGING, 'false');
  assert.ok(normalPage.config.images.remotePatterns.length > 0);
  for (const filename of [
    'sentry.client.config.ts',
    'sentry.server.config.ts',
    'sentry.edge.config.ts',
  ]) {
    let init = 0;
    load(
      filename,
      { NEXT_PUBLIC_KK_STAGING: 'false' },
      {
        '@sentry/nextjs': {
          init: () => {
            init++;
          },
          httpIntegration: () => ({}),
        },
      }
    );
    assert.equal(
      init,
      1,
      `${filename} preserves public deployment initialization`
    );
  }

  console.log(
    '✓ Actual staging/preview provider, identity, telemetry and noindex boundaries passed; normal mocked behavior retained'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
