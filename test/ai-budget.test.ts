import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { PrismaClient } from '@prisma/client';
import { AIBudgetError, createAIBudgetGuard } from '../lib/ai-budget';

const policy = {
  AI_MONTHLY_USER_BUDGET_USD: '0.010000',
  AI_MONTHLY_GLOBAL_BUDGET_USD: '0.020000',
  AI_TEXT_REQUEST_RESERVATION_USD: '0.001000',
  AI_IMAGE_REQUEST_RESERVATION_USD: '0.002000',
  AI_TRANSLATION_REQUEST_RESERVATION_USD: '0.000100',
};
const request = {
  userId: 'synthetic-actor',
  kind: 'text' as const,
  purpose: 'unit-test',
};

function database(
  options: {
    fail?: boolean;
    insertFail?: boolean;
    insertWrongId?: boolean;
    globalMicros?: string;
    userMicros?: string;
    invalidCount?: string;
    admittedAt?: string | null;
    transactionStartedAt?: string;
    priorMonthGlobalMicros?: string;
  } = {}
) {
  let transactions = 0;
  let inserts = 0;
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      transactions++;
      if (options.fail) throw new Error('Synthetic database failure');
      return callback({
        $queryRaw: async (
          query: { sql?: string; values?: unknown[] } | TemplateStringsArray
        ) => {
          const sql =
            'sql' in query
              ? query.sql!
              : Array.from(query as TemplateStringsArray).join('?');
          queries.push({
            sql,
            values: 'sql' in query ? [...(query.values ?? [])] : [],
          });
          if (sql.includes('pg_advisory_xact_lock')) return [{ locked: 1 }];
          if (sql.includes('clock_timestamp'))
            return [
              {
                admittedAt:
                  options.admittedAt === undefined
                    ? '2026-11-01 00:00:00.123'
                    : options.admittedAt,
              },
            ];
          if (sql.includes('INSERT INTO')) {
            inserts++;
            if (options.insertFail)
              throw new Error('Synthetic reservation write failure');
            return [
              {
                id: options.insertWrongId
                  ? 'wrong-synthetic-id'
                  : (query as { values: unknown[] }).values[0],
              },
            ];
          }
          const queryTime =
            queries
              .at(-1)!
              .values.find(
                value =>
                  typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value)
              ) ?? options.transactionStartedAt;
          const usesPriorMonth =
            options.priorMonthGlobalMicros !== undefined &&
            String(queryTime).slice(0, 7) !== options.admittedAt?.slice(0, 7);
          return [
            {
              globalMicros: usesPriorMonth
                ? options.priorMonthGlobalMicros
                : (options.globalMicros ?? '0'),
              userMicros: options.userMicros ?? '0',
              invalidCount: options.invalidCount ?? '0',
            },
          ];
        },
      });
    },
  } as unknown as Pick<PrismaClient, '$transaction'>;
  return {
    client,
    transactions: () => transactions,
    inserts: () => inserts,
    queries,
  };
}

// Only explicit fake dependencies are allowed; no application Prisma module,
// real provider SDK, network, real environment keys, or paid call is imported.
function aiModule<T>(
  file: string,
  reserve: ReturnType<typeof createAIBudgetGuard>,
  completionContent?: object
) {
  const calls = { constructors: 0, text: 0, image: 0, fetch: 0, imageFetch: 0 };
  const sdk = class {
    constructor(options: { maxRetries: number }) {
      calls.constructors++;
      assert.equal(
        options.maxRetries,
        0,
        'SDK retries require separate reservations'
      );
    }
    chat = {
      completions: {
        create: async () => {
          calls.text++;
          return {
            choices: [
              { message: { content: JSON.stringify(completionContent ?? {}) } },
            ],
          };
        },
      },
    };
    images = {
      edit: async () => {
        calls.image++;
        return { data: [{ b64_json: 'c3ludGhldGlj' }] };
      },
    };
  };
  const dependencies: Record<string, unknown> = {
    openai: { __esModule: true, default: sdk, toFile: async () => ({}) },
    '@sentry/nextjs': { captureException: () => {} },
    '@/lib/ai-budget': { AIBudgetError, reserveAICall: reserve },
    url: { URL },
    'sanitize-html': { __esModule: true, default: (value: string) => value },
    '@/lib/security-utils': {
      sanitizeForPrompt: (text: string) => text,
      validateImageUrl: () => ({ valid: true }),
      secureFetchImage: async () => {
        calls.imageFetch++;
        return { success: true, data: Buffer.from('synthetic') };
      },
    },
  };
  const code = ts.transpileModule(
    readFileSync(new URL(`../lib/${file}.ts`, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }
  ).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected AI dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { OPENAI_API_KEY: 'synthetic-provider-key' } },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Buffer,
    fetch: async () => {
      calls.fetch++;
      return { ok: false, status: 404, text: async () => 'model not found' };
    },
  });
  return { module: exports as T, calls };
}

async function run() {
  // Staging denies paid admission even with valid nonzero budgets and keys.
  for (const staging of [
    { KK_DEPLOYMENT_MODE: 'staging' },
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'production', KK_DEPLOYMENT_MODE: 'staging' },
  ]) {
    const db = database();
    await assert.rejects(
      createAIBudgetGuard(db.client, {
        ...policy,
        ...staging,
        OPENAI_API_KEY: 'test-accidental-key',
      })(request),
      (error: unknown) =>
        error instanceof AIBudgetError && error.code === 'DISABLED'
    );
    assert.equal(db.transactions(), 0);
  }
  const disabled = database();
  await assert.rejects(
    createAIBudgetGuard(disabled.client, {})(request),
    (error: unknown) =>
      error instanceof AIBudgetError && error.code === 'DISABLED'
  );
  assert.equal(disabled.transactions(), 0);
  for (const value of [
    '-1',
    'NaN',
    'Infinity',
    '0.0000001',
    '1e3',
    '1.2345678',
    '1000000.000001',
  ]) {
    const db = database();
    await assert.rejects(
      createAIBudgetGuard(db.client, {
        ...policy,
        AI_MONTHLY_GLOBAL_BUDGET_USD: value,
      })(request),
      AIBudgetError
    );
    assert.equal(db.transactions(), 0);
  }
  for (const invalid of [
    { userId: undefined },
    { userId: 'service:unknown' },
    { userId: 'service:translation' },
    { estimatedUsd: NaN },
    { estimatedUsd: Infinity },
    { estimatedUsd: -1 },
    { estimatedUsd: 0 },
    { estimatedUsd: 0.002 },
  ]) {
    const db = database();
    await assert.rejects(
      createAIBudgetGuard(db.client, policy)({ ...request, ...invalid }),
      AIBudgetError
    );
    assert.equal(db.transactions(), 0);
  }
  for (const options of [
    { fail: true },
    { insertFail: true },
    { insertWrongId: true },
    { globalMicros: '20000' },
    { userMicros: '10000' },
    { invalidCount: '1' },
    { globalMicros: 'NaN' },
    { admittedAt: null },
    { admittedAt: 'not-a-timestamp' },
  ]) {
    const db = database(options);
    await assert.rejects(
      createAIBudgetGuard(db.client, policy)(request),
      AIBudgetError
    );
  }
  const allowed = database();
  const reservation = await createAIBudgetGuard(
    allowed.client,
    policy
  )(request);
  assert.equal(reservation.reservedUsd, 0.001);
  assert.equal(reservation.actorId, request.userId);
  assert.equal(allowed.inserts(), 1);
  // The transaction began in October, but admission after a waiting lock is in
  // November. Neither the ledger bucket nor the insert may reuse its old time.
  const transactionStartedAt = '2026-10-31 23:59:59.999';
  const admittedAt = '2026-11-01 00:00:00.123';
  assert.ok(transactionStartedAt < admittedAt);
  assert.ok(allowed.queries[0].sql.includes('pg_advisory_xact_lock'));
  assert.ok(allowed.queries[1].sql.includes('clock_timestamp'));
  assert.ok(allowed.queries[1].sql.includes('timestamp(3)'));
  const aggregate = allowed.queries.find(query =>
    query.sql.includes('FROM "AIUsage"')
  )!;
  const insertion = allowed.queries.find(query =>
    query.sql.includes('INSERT INTO')
  )!;
  assert.deepEqual(
    aggregate.values.filter(value => value === admittedAt),
    [admittedAt, admittedAt]
  );
  assert.equal(insertion.values.at(-1), admittedAt);
  assert.ok(
    !aggregate.sql.includes('CURRENT_TIMESTAMP') &&
      !insertion.sql.includes('CURRENT_TIMESTAMP')
  );
  assert.ok(
    !aggregate.values.includes(transactionStartedAt) &&
      !insertion.values.includes(transactionStartedAt)
  );
  const newMonthFull = database({
    globalMicros: '20000',
    priorMonthGlobalMicros: '0',
    transactionStartedAt,
    admittedAt,
  });
  await assert.rejects(
    createAIBudgetGuard(newMonthFull.client, policy)(request),
    (error: unknown) =>
      error instanceof AIBudgetError && error.code === 'LIMIT_EXCEEDED'
  );
  assert.equal(
    newMonthFull.inserts(),
    0,
    'A request waiting across the month boundary must see the new month quota'
  );

  type Enhancement = {
    enhanceProductPresentation: (
      input: object
    ) => Promise<{ enhancedImageUrl: string }>;
  };
  type Assessment = {
    assessProductWithAI: (input: object) => Promise<unknown>;
  };
  type Image = {
    generateProductImageBuffer: (input: object) => Promise<Buffer>;
  };
  for (const file of [
    'product-enhancement-openai',
    'moderation-ai',
    'image-gen',
  ]) {
    const db = database();
    const loaded = aiModule<Enhancement & Assessment & Image>(
      file,
      createAIBudgetGuard(db.client, {})
    );
    const input = {
      userId: request.userId,
      title: 'Synthetic craft',
      description: 'Synthetic description',
    };
    const invoke =
      file === 'product-enhancement-openai'
        ? () => loaded.module.enhanceProductPresentation(input)
        : file === 'moderation-ai'
          ? () => loaded.module.assessProductWithAI(input)
          : () => loaded.module.generateProductImageBuffer(input);
    await assert.rejects(
      invoke(),
      (error: unknown) =>
        error instanceof AIBudgetError && error.code === 'DISABLED'
    );
    assert.equal(
      loaded.calls.constructors +
        loaded.calls.text +
        loaded.calls.image +
        loaded.calls.fetch,
      0,
      'A provider key alone must not enable paid AI'
    );
    assert.equal(db.transactions(), 0);
  }
  for (const options of [
    { fail: true },
    { insertFail: true },
    { globalMicros: '20000' },
    { userMicros: '10000' },
  ]) {
    for (const file of [
      'product-enhancement-openai',
      'moderation-ai',
      'image-gen',
    ]) {
      const db = database(options);
      const loaded = aiModule<Enhancement & Assessment & Image>(
        file,
        createAIBudgetGuard(db.client, policy)
      );
      const input = {
        userId: request.userId,
        title: 'Synthetic craft',
        description: 'Synthetic description',
      };
      const invoke =
        file === 'product-enhancement-openai'
          ? () => loaded.module.enhanceProductPresentation(input)
          : file === 'moderation-ai'
            ? () => loaded.module.assessProductWithAI(input)
            : () => loaded.module.generateProductImageBuffer(input);
      await assert.rejects(invoke(), AIBudgetError);
      assert.equal(
        loaded.calls.constructors +
          loaded.calls.text +
          loaded.calls.image +
          loaded.calls.fetch,
        0,
        `${file} must not contact a provider after budget denial or tracking failure`
      );
    }
  }
  for (const file of ['product-enhancement-openai', 'moderation-ai']) {
    const loaded = aiModule<Enhancement & Assessment>(
      file,
      createAIBudgetGuard(database().client, policy)
    );
    const input = {
      title: 'Synthetic craft',
      description: 'Synthetic description',
    };
    await assert.rejects(
      file === 'moderation-ai'
        ? loaded.module.assessProductWithAI(input)
        : loaded.module.enhanceProductPresentation(input),
      AIBudgetError
    );
    assert.equal(
      loaded.calls.constructors,
      0,
      'Missing human identity must deny before provider construction'
    );
  }

  const imageDenied = aiModule<Enhancement>(
    'product-enhancement-openai',
    async input => {
      if (input.kind === 'image')
        throw new AIBudgetError(
          'TRACKING_FAILED',
          'Synthetic image reservation failure'
        );
      return createAIBudgetGuard(database().client, policy)(input);
    },
    {
      enhancedDescription: 'Synthetic enhancement',
      enhancedTitle: 'Synthetic title',
      suggestedTags: [],
      improvements: [],
      confidence: 80,
      imageEditPrompt: 'Lighting',
    }
  );
  const imageResult = await imageDenied.module.enhanceProductPresentation({
    userId: request.userId,
    title: 'Synthetic craft',
    description: 'Synthetic description',
    imageUrl: 'https://images.example.invalid/original.png',
  });
  assert.equal(imageDenied.calls.text, 1);
  assert.equal(imageDenied.calls.image + imageDenied.calls.imageFetch, 0);
  assert.equal(
    imageResult.enhancedImageUrl,
    'https://images.example.invalid/original.png'
  );

  let attempts = 0;
  const fallback = aiModule<Image>('image-gen', async input => {
    attempts++;
    if (attempts > 1)
      throw new AIBudgetError('LIMIT_EXCEEDED', 'Synthetic next-attempt limit');
    return createAIBudgetGuard(database().client, policy)(input);
  });
  await assert.rejects(
    fallback.module.generateProductImageBuffer({
      userId: 'service:image-generation',
      title: 'Synthetic craft',
      description: 'Synthetic description',
    }),
    AIBudgetError
  );
  assert.equal(attempts, 2);
  assert.equal(
    fallback.calls.fetch,
    1,
    'Fallback must reserve before every provider attempt'
  );
  const legacyDB = database();
  const legacy = aiModule<{
    trackAIUsage: (
      userId: string,
      service: string,
      estimate: number
    ) => Promise<{ allowed: boolean }>;
    estimateGPT5MiniCost: (input: number, output: number) => number;
  }>('security-utils', createAIBudgetGuard(legacyDB.client, policy));
  for (const estimate of [NaN, Infinity, -1, 0]) {
    assert.equal(
      (await legacy.module.trackAIUsage(request.userId!, 'GPT5_MINI', estimate))
        .allowed,
      false
    );
  }
  assert.equal(
    legacyDB.transactions(),
    0,
    'Legacy tracker must not write invalid costs'
  );
  assert.throws(() => legacy.module.estimateGPT5MiniCost(-1, 1), AIBudgetError);
  assert.throws(
    () => legacy.module.estimateGPT5MiniCost(1.5, 1),
    AIBudgetError
  );
  assert.equal(
    (await legacy.module.trackAIUsage(request.userId!, 'GPT5_MINI', 0.001))
      .allowed,
    true
  );
  assert.equal(legacyDB.inserts(), 1);
  console.log(
    '✓ AI budget validation and actual caller zero-provider/fallback regressions passed'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
