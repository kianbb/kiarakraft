import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

type Azure = typeof import('../lib/azure-translator');
type Translator = typeof import('../lib/translator');
type Env = Record<string, string>;

function load<T>(
  file: string,
  dependencies: Record<string, unknown>,
  env: Env,
  fetcher: typeof fetch
): T {
  const code = ts.transpileModule(
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }
  ).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    URL,
    AbortSignal,
    fetch: fetcher,
    process: { env },
    console: {
      error: () => assert.fail('Translation must not log provider text/errors'),
      warn: () => assert.fail('Translation must not log provider text/errors'),
    },
    require(name: string) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

async function run() {
  const env: Env = {
    TRANSLATOR_PROVIDER: 'azure',
    AZURE_TRANSLATOR_KEY: crypto.randomBytes(16).toString('hex'),
    AZURE_TRANSLATOR_ENDPOINT: 'https://api.cognitive.microsofttranslator.com',
  };
  let allowed = false;
  let reservations = 0;
  let calls = 0;
  let unhealthy = false;
  let malformed: 'empty' | 'language' | undefined;
  let lastPath = '';
  const fetcher = (async (
    input: string | URL | Request,
    options?: RequestInit
  ) => {
    calls++;
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal instanceof AbortSignal);
    const url = new URL(String(input));
    lastPath = url.pathname;
    assert.equal(url.origin, new URL(env.AZURE_TRANSLATOR_ENDPOINT).origin);
    if (unhealthy)
      return new Response('private provider body', { status: 500 });
    const texts = JSON.parse(String(options?.body)) as { text: string }[];
    const body = url.pathname.endsWith('/detect')
      ? [{ language: 'en' }]
      : texts.map(({ text }) => ({
          translations: [
            {
              text: malformed === 'empty' ? '  ' : `translated:${text}`,
              to:
                malformed === 'language' ? 'wrong' : url.searchParams.get('to'),
            },
          ],
        }));
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const azure = load<Azure>(
    'lib/azure-translator.ts',
    {
      './ai-budget': {
        reserveAICall: async (request: {
          userId: string;
          kind: string;
          purpose: string;
        }) => {
          reservations++;
          assert.equal(request.userId, 'service:translation');
          assert.equal(request.kind, 'translation');
          assert.match(request.purpose, /^azure\.(translate|detect)$/);
          if (!allowed) throw new Error('Synthetic quota/tracking failure');
          return { id: 'synthetic-reservation' };
        },
      },
    },
    env,
    fetcher
  );
  for (const attempt of [
    () => azure.translateText('hello', 'fa', 'en'),
    () => azure.translateTexts(['hello', 'world'], 'fa', 'en'),
    () => azure.detectLanguage('hello'),
  ])
    await attempt();
  assert.equal(reservations, 3);
  assert.equal(
    calls,
    0,
    'Every Azure operation must stop before fetch on denied/tracking errors'
  );

  allowed = true;
  assert.equal(
    await azure.translateText('سلام', 'en', 'fa'),
    'translated:سلام'
  );
  assert.deepEqual(
    Array.from(await azure.translateTexts(['سلام', 'دنیا'], 'en', 'fa')),
    ['translated:سلام', 'translated:دنیا']
  );
  assert.equal(await azure.detectLanguage('hello'), 'en');
  assert.equal(reservations, 6);
  assert.equal(calls, 3);

  const before = reservations;
  await azure.translateText('x'.repeat(5001), 'fa', 'en');
  await azure.translateText('hello', 'en', 'en');
  await azure.translateText('hello', 'invalid!language');
  await azure.translateTexts(Array(26).fill('text'), 'en');
  await azure.translateTexts(['x'.repeat(5001)], 'en');
  await azure.translateTexts(Array(4).fill('x'.repeat(5000)), 'en');
  await azure.detectLanguage('x'.repeat(5001));
  assert.equal(
    reservations,
    before,
    'Invalid/oversized/same-language inputs must not spend'
  );
  const key = env.AZURE_TRANSLATOR_KEY;
  delete env.AZURE_TRANSLATOR_KEY;
  assert.equal(await azure.translateText('unconfigured', 'fa'), 'unconfigured');
  assert.equal(reservations, before);
  env.AZURE_TRANSLATOR_KEY = key;

  const wrapper = load<Translator>(
    'lib/translator.ts',
    { crypto, './azure-translator': azure },
    env,
    fetcher
  );
  allowed = false;
  assert.equal(
    await wrapper.translateText('retry after denial', { from: 'en', to: 'fa' }),
    'retry after denial'
  );
  const deniedCalls = calls;
  allowed = true;
  assert.equal(
    await wrapper.translateText('retry after denial', { from: 'en', to: 'fa' }),
    'translated:retry after denial'
  );
  assert.equal(
    calls,
    deniedCalls + 1,
    'Fallback must not be cached as a successful translation'
  );
  const cachedCalls = calls;
  await wrapper.translateText('retry after denial', { from: 'en', to: 'fa' });
  assert.equal(calls, cachedCalls, 'Successful cached translation is free');
  unhealthy = true;
  const failureReservations = reservations;
  assert.equal(
    await wrapper.translateText('retry after provider error', {
      from: 'en',
      to: 'fa',
    }),
    'retry after provider error'
  );
  assert.equal(reservations, failureReservations + 1);
  unhealthy = false;
  assert.equal(
    await wrapper.translateText('retry after provider error', {
      from: 'en',
      to: 'fa',
    }),
    'translated:retry after provider error'
  );
  assert.equal(
    reservations,
    failureReservations + 2,
    'A new explicit attempt needs a new reservation'
  );
  for (const mode of ['empty', 'language'] as const) {
    malformed = mode;
    assert.equal(
      await azure.translateText('keep original', 'en', 'fa'),
      'keep original'
    );
    assert.deepEqual(
      Array.from(await azure.translateTexts(['keep', 'original'], 'en', 'fa')),
      ['keep', 'original']
    );
  }
  malformed = undefined;
  env.AZURE_TRANSLATOR_ENDPOINT += '/translator/text/v3.0';
  assert.equal(
    await azure.translateText('custom path', 'en', 'fa'),
    'translated:custom path'
  );
  assert.equal(lastPath, '/translator/text/v3.0/translate');
  console.log(
    '✓ All Azure operations and translation wrapper deny before HTTP, preserve source, and avoid caching failures'
  );
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
