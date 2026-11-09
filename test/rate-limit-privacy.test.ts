import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { NextRequest } from 'next/server';

type RateLimitModule = typeof import('../lib/rateLimit');
type Entry = { identifier: string; count: number; resetTime: Date };
const privateSentinel = 'synthetic-private-rate-limit-sentinel';

function harness() {
  const logs: unknown[][] = [];
  const intervals: Array<{ callback: () => void | Promise<void>; ms: number }> =
    [];
  const entries = new Map<string, Entry>();
  const state = {
    now: Date.UTC(2026, 10, 9),
    auth: 'user' as 'user' | 'anonymous' | 'error',
    databaseError: false,
    cleanupError: false,
    authCalls: 0,
    transactions: 0,
    cleanups: 0,
    memoryDeletes: 0,
  };
  class MemoryMap extends Map<string, { count: number; resetTime: Date }> {
    delete(key: string) {
      state.memoryDeletes++;
      return super.delete(key);
    }
  }
  class Clock extends Date {
    constructor(value?: string | number | Date) {
      super(
        value === undefined
          ? state.now
          : value instanceof Date
            ? value.getTime()
            : value
      );
    }
    static now() {
      return state.now;
    }
  }
  const database = {
    async deleteMany({
      where,
    }: {
      where: { identifier?: string; resetTime: { lt: Date } };
    }) {
      if (state.cleanupError) throw new Error(privateSentinel);
      state.cleanups++;
      for (const [key, entry] of entries) {
        if (
          (!where.identifier || key === where.identifier) &&
          entry.resetTime < where.resetTime.lt
        )
          entries.delete(key);
      }
    },
    async findUnique({ where }: { where: { identifier: string } }) {
      return entries.get(where.identifier) || null;
    },
    async create({ data }: { data: Entry }) {
      entries.set(data.identifier, { ...data });
      return data;
    },
    async update({ where }: { where: { identifier: string } }) {
      const entry = entries.get(where.identifier)!;
      entry.count++;
      return entry;
    },
  };
  const dependencies = {
    './prisma': {
      prisma: {
        rateLimit: database,
        async $transaction<T>(
          callback: (tx: { rateLimit: typeof database }) => T
        ) {
          state.transactions++;
          if (state.databaseError) throw new Error(privateSentinel);
          return callback({ rateLimit: database });
        },
      },
    },
    '@/lib/auth': {
      async auth() {
        state.authCalls++;
        if (state.auth === 'error') throw new Error(privateSentinel);
        return state.auth === 'user' ? { user: { id: privateSentinel } } : null;
      },
    },
  };
  const code = ts.transpileModule(
    readFileSync(new URL('../lib/rateLimit.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const rateLimitModule = {} as RateLimitModule;
  runInNewContext(code, {
    exports: rateLimitModule,
    require(name: string) {
      assert.ok(
        name in dependencies,
        `Unexpected rate-limit dependency: ${name}`
      );
      return dependencies[name as keyof typeof dependencies];
    },
    console: Object.fromEntries(
      ['log', 'warn', 'error'].map(method => [
        method,
        (...args: unknown[]) => logs.push(args),
      ])
    ),
    Date: Clock,
    Map: MemoryMap,
    URL,
    Response,
    setInterval(callback: () => void | Promise<void>, ms: number) {
      intervals.push({ callback, ms });
      return 0;
    },
  });
  assert.equal(intervals.length, 2, 'Timers must be captured, never scheduled');
  const request = new Request(
    `http://127.0.0.1/${privateSentinel}?token=${privateSentinel}`,
    { headers: { 'x-forwarded-for': privateSentinel } }
  ) as NextRequest;
  function assertPrivateLogs() {
    assert.ok(
      logs.length > 0,
      'Failure/block paths must retain operational logs'
    );
    assert.ok(!JSON.stringify(logs).includes(privateSentinel));
    for (const args of logs) {
      assert.equal(
        args.length,
        1,
        'Logs must not attach identifiers or exceptions'
      );
      assert.equal(typeof args[0], 'string');
    }
  }
  return {
    rateLimitModule,
    request,
    state,
    entries,
    intervals,
    logs,
    assertPrivateLogs,
  };
}

async function run() {
  {
    const h = harness();
    const limiter = h.rateLimitModule.createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      useUserRateLimit: true,
      userMaxRequests: 2,
    });
    const first = await limiter(h.request);
    assert.equal(first.allowed, true);
    assert.equal(first.remainingRequests, 1);
    assert.equal(first.resetTime, h.state.now + 60_000);
    const second = await limiter(h.request);
    assert.equal(second.allowed, true);
    assert.equal(second.remainingRequests, 0);
    const blocked = await limiter(h.request);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remainingRequests, 0);
    assert.equal(blocked.resetTime, first.resetTime);
    assert.ok([...h.entries.keys()][0].startsWith(`user:${privateSentinel}:`));
    h.state.now += 60_001;
    assert.equal((await limiter(h.request)).remainingRequests, 1);
    h.assertPrivateLogs();
  }
  {
    const h = harness();
    h.state.auth = 'error';
    const limiter = h.rateLimitModule.createRateLimiter({
      windowMs: 10_000,
      maxRequests: 1,
      useUserRateLimit: true,
      userMaxRequests: 5,
    });
    assert.equal((await limiter(h.request)).allowed, true);
    assert.equal((await limiter(h.request)).allowed, false);
    assert.ok([...h.entries.keys()][0].startsWith(`ip:${privateSentinel}:`));
    assert.equal(h.state.authCalls, 2);
    h.assertPrivateLogs();
  }
  {
    const h = harness();
    h.state.databaseError = true;
    const limiter = h.rateLimitModule.createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
    });
    let handled = 0;
    const wrapped = h.rateLimitModule.withRateLimit(
      limiter,
      async (_request, token: string) => {
        handled++;
        assert.equal(token, 'synthetic-handler-argument');
        return new Response('synthetic response');
      }
    );
    const first = await wrapped(h.request, 'synthetic-handler-argument');
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('X-RateLimit-Remaining'), '1');
    assert.equal(
      first.headers.get('X-RateLimit-Reset'),
      String((h.state.now + 60_000) / 1000)
    );
    assert.equal(
      (await wrapped(h.request, 'synthetic-handler-argument')).status,
      200
    );
    const blocked = await wrapped(h.request, 'synthetic-handler-argument');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('Retry-After'), '60');
    assert.equal(blocked.headers.get('X-RateLimit-Remaining'), '0');
    assert.equal((await blocked.json()).retryAfter, 60);
    assert.equal(handled, 2, 'A blocked request must never reach the handler');
    assert.equal(h.state.authCalls, 0);

    h.state.now += 60_001;
    await h.intervals.find(interval => interval.ms === 60_000)!.callback();
    assert.equal(
      h.state.memoryDeletes,
      1,
      'Memory cleanup removes expired entries'
    );
    assert.equal((await limiter(h.request)).remainingRequests, 1);
    h.state.databaseError = false;
    assert.equal((await limiter(h.request)).remainingRequests, 1);
    assert.equal(
      h.entries.size,
      1,
      'Database admission resumes after recovery'
    );
    h.state.cleanupError = true;
    await h.intervals.find(interval => interval.ms === 300_000)!.callback();
    h.state.cleanupError = false;
    h.state.now += 60_001;
    await h.intervals.find(interval => interval.ms === 300_000)!.callback();
    assert.equal(
      h.entries.size,
      0,
      'Database cleanup still removes expired entries'
    );
    h.assertPrivateLogs();
  }
  console.log(
    '✓ Actual rate limiter keeps auth/DB failures, blocks and cleanup logs private while preserving admission/fallback semantics'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
