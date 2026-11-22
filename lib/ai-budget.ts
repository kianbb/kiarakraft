import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { isStagingDeployment } from './deployment-policy';

export type AICallKind = 'text' | 'image' | 'translation';
type BudgetSource = Record<string, string | undefined>;
type BudgetDatabase = Pick<PrismaClient, '$transaction'>;

export class AIBudgetError extends Error {
  constructor(
    public readonly code:
      | 'DISABLED'
      | 'INVALID_INPUT'
      | 'LIMIT_EXCEEDED'
      | 'TRACKING_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'AIBudgetError';
  }
}

export type AICallRequest = {
  userId: string | undefined;
  purpose: string;
  kind: AICallKind;
  estimatedUsd?: number;
};

export type AIReservation = {
  id: string;
  userId: string | null;
  actorId: string;
  purpose: string;
  kind: AICallKind;
  reservedUsd: number;
  userMonthlyReservedUsd: number;
  globalMonthlyReservedUsd: number;
  userLimitUsd: number;
};

const MICRO_USD = BigInt(1_000_000);
// AIUsage.cost is a legacy Float. Keep six-decimal USD well within its 15
// significant decimal digits; larger ledgers need an integer/decimal schema.
// This is a representation ceiling, not an enabled spending budget.
const MAX_CONFIG_MICRO_USD = BigInt(1_000_000_000_000);
const requestSettings = {
  text: 'AI_TEXT_REQUEST_RESERVATION_USD',
  image: 'AI_IMAGE_REQUEST_RESERVATION_USD',
  translation: 'AI_TRANSLATION_REQUEST_RESERVATION_USD',
} as const;
const serviceActors = {
  'service:translation': 'translation',
  'service:image-generation': 'image',
} as const;

function configuredUsd(source: BudgetSource, name: string): bigint {
  const value = source[name];
  if (!value || /^0(?:\.0+)?$/.test(value)) {
    throw new AIBudgetError(
      'DISABLED',
      'Paid AI is disabled until explicit spending limits are configured'
    );
  }
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new AIBudgetError(
      'INVALID_INPUT',
      'AI spending limits must be positive USD amounts with at most six decimal places'
    );
  }
  const [whole, fraction = ''] = value.split('.');
  const micros = BigInt(whole) * MICRO_USD + BigInt(fraction.padEnd(6, '0'));
  if (micros <= BigInt(0) || micros > MAX_CONFIG_MICRO_USD) {
    throw new AIBudgetError(
      'INVALID_INPUT',
      'AI spending limit is outside the supported range'
    );
  }
  return micros;
}

function validate(request: AICallRequest, source: BudgetSource) {
  if (isStagingDeployment(source)) {
    throw new AIBudgetError('DISABLED', 'Paid AI is disabled in staging');
  }
  if (
    typeof request.userId !== 'string' ||
    !/^[A-Za-z0-9:_-]{1,200}$/.test(request.userId) ||
    typeof request.purpose !== 'string' ||
    !/^[a-z][a-z0-9_.:-]{0,79}$/i.test(request.purpose) ||
    !Object.hasOwn(requestSettings, request.kind)
  ) {
    throw new AIBudgetError(
      'INVALID_INPUT',
      'AI calls require an explicit actor, kind, and non-sensitive purpose'
    );
  }
  if (
    request.userId.startsWith('service:') &&
    (!Object.hasOwn(serviceActors, request.userId) ||
      serviceActors[request.userId as keyof typeof serviceActors] !==
        request.kind)
  ) {
    throw new AIBudgetError(
      'INVALID_INPUT',
      'Unknown AI service actor or mismatched call kind'
    );
  }
  const userLimit = configuredUsd(source, 'AI_MONTHLY_USER_BUDGET_USD');
  const globalLimit = configuredUsd(source, 'AI_MONTHLY_GLOBAL_BUDGET_USD');
  const reserved = configuredUsd(source, requestSettings[request.kind]);
  if (request.estimatedUsd !== undefined) {
    if (
      !Number.isFinite(request.estimatedUsd) ||
      request.estimatedUsd <= 0 ||
      !Number.isSafeInteger(Math.ceil(request.estimatedUsd * Number(MICRO_USD)))
    ) {
      throw new AIBudgetError(
        'INVALID_INPUT',
        'AI cost estimate must be finite and positive'
      );
    }
    if (
      BigInt(Math.ceil(request.estimatedUsd * Number(MICRO_USD))) > reserved
    ) {
      throw new AIBudgetError(
        'LIMIT_EXCEEDED',
        'AI estimate exceeds the configured request reservation'
      );
    }
  }
  if (reserved > userLimit || reserved > globalLimit) {
    throw new AIBudgetError(
      'LIMIT_EXCEEDED',
      'AI request reservation exceeds spending limits'
    );
  }
  return {
    actorId: request.userId,
    userId: request.userId.startsWith('service:') ? null : request.userId,
    userLimit,
    globalLimit,
    reserved,
  };
}

function ledgerMicros(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AIBudgetError(
      'TRACKING_FAILED',
      'AI usage ledger is invalid; paid AI is blocked'
    );
  }
  return BigInt(value);
}

async function reserve(
  db: BudgetDatabase,
  request: AICallRequest,
  policy: ReturnType<typeof validate>
): Promise<AIReservation> {
  try {
    return await db.$transaction(
      async tx => {
        // Every actor and provider shares one lock. ReadCommitted ensures sums
        // after a waiting lock observe the preceding reservation's commit.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(73104824)`;
        // CURRENT_TIMESTAMP would retain the transaction's pre-lock time.
        // Capture the admission time only after the lock, at the same precision
        // as AIUsage.timestamp, then use it for both the bucket and the insert.
        const admission = await tx.$queryRaw<Array<{ admittedAt: string }>>`
          SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)::text AS "admittedAt"
        `;
        const admittedAt = admission[0]?.admittedAt;
        if (
          typeof admittedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(
            admittedAt
          )
        ) {
          throw new AIBudgetError(
            'TRACKING_FAILED',
            'AI admission timestamp is invalid; paid AI is blocked'
          );
        }
        const rows = await tx.$queryRaw<
          Array<{
            globalMicros: string;
            userMicros: string;
            invalidCount: string;
          }>
        >(Prisma.sql`
        SELECT
          COALESCE(SUM(CEIL(cost::numeric * 1000000)), 0)::text AS "globalMicros",
          COALESCE(SUM(CEIL(cost::numeric * 1000000)) FILTER (WHERE "actorId" = ${policy.actorId}), 0)::text AS "userMicros",
          COUNT(*) FILTER (WHERE NOT (cost >= 0 AND cost < 'Infinity'::float8))::text AS "invalidCount"
        FROM "AIUsage"
        WHERE timestamp >= date_trunc('month', ${admittedAt}::timestamp)
          AND timestamp < date_trunc('month', ${admittedAt}::timestamp) + interval '1 month'
      `);
        const totals = rows[0];
        if (!totals || totals.invalidCount !== '0') {
          throw new AIBudgetError(
            'TRACKING_FAILED',
            'AI usage ledger is invalid; paid AI is blocked'
          );
        }
        const globalTotal = ledgerMicros(totals.globalMicros);
        const userTotal = ledgerMicros(totals.userMicros);
        if (
          globalTotal + policy.reserved > policy.globalLimit ||
          userTotal + policy.reserved > policy.userLimit
        ) {
          throw new AIBudgetError(
            'LIMIT_EXCEEDED',
            'Monthly AI usage limit exceeded'
          );
        }
        const id = randomUUID();
        const reservedUsd = Number(policy.reserved) / Number(MICRO_USD);
        const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "AIUsage" (id, "userId", "actorId", service, cost, timestamp)
        VALUES (${id}, ${policy.userId}, ${policy.actorId}, ${`reservation:${request.kind}:${request.purpose}`}, ${reservedUsd}, ${admittedAt}::timestamp)
        RETURNING id
      `);
        if (inserted.length !== 1 || inserted[0].id !== id) {
          throw new AIBudgetError(
            'TRACKING_FAILED',
            'AI reservation was not persisted'
          );
        }
        return {
          id,
          userId: policy.userId,
          actorId: policy.actorId,
          purpose: request.purpose,
          kind: request.kind,
          reservedUsd,
          userMonthlyReservedUsd:
            Number(userTotal + policy.reserved) / Number(MICRO_USD),
          globalMonthlyReservedUsd:
            Number(globalTotal + policy.reserved) / Number(MICRO_USD),
          userLimitUsd: Number(policy.userLimit) / Number(MICRO_USD),
        };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 }
    );
  } catch (error) {
    if (error instanceof AIBudgetError) throw error;
    // Do not expose raw SQL/connection information or permit a call on failure.
    throw new AIBudgetError(
      'TRACKING_FAILED',
      'AI usage reservation failed; paid AI is blocked'
    );
  }
}

export function createAIBudgetGuard(
  db: BudgetDatabase,
  source: BudgetSource = process.env
) {
  return async (request: AICallRequest) =>
    reserve(db, request, validate(request, source));
}

// Reservations remain consumed on errors, timeouts and process termination.
// These configured reservation quotas are not a provider-invoice guarantee:
// request pricing/usage must be reconciled before choosing or enabling limits.
export async function reserveAICall(
  request: AICallRequest
): Promise<AIReservation> {
  const policy = validate(request, process.env);
  const { prisma } = await import('./prisma');
  return reserve(prisma, request, policy);
}
