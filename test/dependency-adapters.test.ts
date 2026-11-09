import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as Sentry from '@sentry/nextjs';
import nodemailer from 'smtp-mailer';
import { render } from '@react-email/render';
import { createElement } from 'react';
import {
  telemetryPrivacyOptions,
  redactTelemetryEvent,
} from '../lib/telemetry-policy';
import { isStagingDeployment } from '../lib/deployment-policy';

async function run() {
  // Real SDKs compose only synthetic in-memory content; no delivery provider.
  const mailer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  const message = await mailer.sendMail({
    from: 'sender@kiarakraft.invalid',
    to: 'buyer@kiarakraft.invalid',
    subject: 'بازیابی آزمایشی',
    text: 'پیام آزمایشی بدون ارسال واقعی',
  });
  assert.deepEqual(message.envelope.to, ['buyer@kiarakraft.invalid']);
  assert.match(message.message.toString(), /Subject: =\?UTF-8/i);
  assert.ok(
    (
      await render(createElement('p', null, 'Synthetic recovery content'))
    ).includes('Synthetic recovery content')
  );

  const configurations: Parameters<typeof Sentry.init>[0][] = [];
  for (const name of ['client', 'server', 'edge']) {
    const code = ts.transpileModule(
      readFileSync(`sentry.${name}.config.ts`, 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText;
    for (const staged of [false, true]) {
      const recorded: Parameters<typeof Sentry.init>[0][] = [];
      const env = {
        NODE_ENV: 'production',
        ...(staged
          ? { KK_DEPLOYMENT_MODE: 'staging', NEXT_PUBLIC_KK_STAGING: 'true' }
          : {}),
      };
      vm.runInNewContext(code, {
        exports: {},
        process: {
          env,
          platform: process.platform,
          version: process.version,
          memoryUsage: process.memoryUsage,
        },
        require: (id: string) => {
          if (id === '@sentry/nextjs')
            return {
              init: (options: Parameters<typeof Sentry.init>[0]) =>
                recorded.push(options),
              httpIntegration: () => ({ name: 'SyntheticHttp' }),
            };
          if (id === './lib/telemetry-policy')
            return { telemetryPrivacyOptions, redactTelemetryEvent };
          if (id === './lib/deployment-policy')
            return { isStagingDeployment: () => isStagingDeployment(env) };
          throw new Error('Unexpected dependency in telemetry configuration');
        },
      });
      assert.equal(recorded.length, staged ? 0 : 1);
      if (!staged) configurations.push(recorded[0]);
    }
  }

  const captured: unknown[] = [];
  // Capture through the installed SDK's real event pipeline and an in-memory
  // transport. A DSN is syntactic only; the transport never accesses its host.
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Dependency tests must not use external HTTP');
  };
  try {
    for (const configuration of configurations) {
      Sentry.init({
        ...configuration,
        dsn: 'https://test@sentry.example.invalid/1',
        defaultIntegrations: false,
        integrations: [],
        debug: false,
        tracesSampleRate: 0,
        transport: () => ({
          send: async (envelope: unknown) => {
            captured.push(envelope);
            return { statusCode: 200 };
          },
          flush: async () => true,
        }),
      });
      Sentry.captureEvent({
        message: 'Synthetic operational error',
        level: 'error',
        user: { email: 'private-sentinel@kiarakraft.invalid' },
        request: {
          url: 'https://example.invalid/reset?token=private-sentinel',
          headers: { authorization: 'private-sentinel' },
          data: 'private-sentinel',
        },
        extra: { resetLink: 'private-sentinel' },
        breadcrumbs: [{ message: 'private-sentinel' }],
        contexts: {
          synthetic: { secret: 'private-sentinel' },
          trace: {
            trace_id: '11111111111111111111111111111111',
            span_id: '1111111111111111',
            data: { token: 'private-sentinel' },
          },
        },
        tags: {
          component: 'synthetic',
          url: 'private-sentinel',
          userAgent: 'private-sentinel',
        },
      });
      assert.equal(await Sentry.flush(2000), true);
      await Sentry.close(2000);
    }
    assert.equal(
      captured.length,
      3,
      'Each ordinary runtime config must retain error reporting'
    );
    const payload = JSON.stringify(captured);
    assert.ok(payload.includes('Synthetic operational error'));
    assert.ok(
      !payload.includes('private-sentinel'),
      'Unrestricted context and reset URLs must not reach the transport'
    );
  } finally {
    globalThis.fetch = previousFetch;
    await Sentry.close(2000);
  }
  console.log(
    '✓ Installed mail/render composition, telemetry startup gates and Node SDK event redaction passed'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
