import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type ResetDatabase = Pick<PrismaClient, '$transaction' | 'passwordResetToken'>;
const TOKEN_PATTERN = /^v1\.(0|[1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/;
const TOKEN_LIFETIME_MS = 60 * 60 * 1000;
export const MAX_RESET_BODY_BYTES = 8192;

export function withinBcryptLimit(value: string): boolean {
  return Buffer.byteLength(value, 'utf8') <= 72;
}

export class ResetInputError extends Error {
  constructor(public readonly status: 400 | 413) {
    super(
      status === 413 ? 'Request body is too large' : 'Invalid request data'
    );
  }
}

// Count actual bytes, not just Content-Length, before parsing untrusted JSON.
export async function readResetBody(request: Request): Promise<unknown> {
  const declaredSize = Number(request.headers.get('content-length'));
  if (declaredSize > MAX_RESET_BODY_BYTES) throw new ResetInputError(413);
  if (!request.body) throw new ResetInputError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESET_BODY_BYTES) {
        // Cancellation belongs to an untrusted stream and can remain pending.
        void reader.cancel().catch(() => {});
        throw new ResetInputError(413);
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    );
  } catch (error) {
    if (error instanceof ResetInputError) throw error;
    throw new ResetInputError(400);
  } finally {
    reader.releaseLock();
  }
}

function credentialVersion(token: string): number | null {
  if (token.length > 80) return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : null;
}

export function passwordResetDigest(token: string): string | null {
  if (credentialVersion(token) === null) return null;
  // No plaintext-token fallback: pre-upgrade links must be requested again.
  return `sha256:v1:${createHash('sha256').update(token).digest('hex')}`;
}

/** Store a digest only; return the bearer solely for the outbound email. */
export async function issuePasswordReset(
  database: ResetDatabase,
  userId: string,
  expectedVersion: number,
  requestStartedAt: number
): Promise<string | null> {
  return database.$transaction(async tx => {
    // Issuance and redemption use the same lock and order. A request that read
    // old credentials cannot queue behind a reset and mint a surviving link.
    const [user] = await tx.$queryRaw<
      Array<{ id: string; passwordChangedAt: Date | null }>
    >`SELECT id, "passwordChangedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const currentVersion = user?.passwordChangedAt?.getTime() ?? 0;
    if (
      !user ||
      currentVersion !== expectedVersion ||
      (user.passwordChangedAt && currentVersion >= requestStartedAt)
    )
      return null;

    const token = `v1.${currentVersion}.${randomBytes(32).toString('base64url')}`;
    const digest = passwordResetDigest(token)!;
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.create({
      data: {
        userId,
        token: digest,
        expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
      },
    });
    return token;
  });
}

/** Advisory UI/pre-hash check; redemption repeats validation under a lock. */
export async function validatePasswordReset(
  database: Pick<PrismaClient, 'passwordResetToken'>,
  token: string
) {
  const digest = passwordResetDigest(token);
  if (!digest) return null;
  const row = await database.passwordResetToken.findUnique({
    where: { token: digest },
    select: {
      used: true,
      expiresAt: true,
      user: { select: { email: true, passwordChangedAt: true } },
    },
  });
  if (
    !row ||
    row.used ||
    row.expiresAt.getTime() <= Date.now() ||
    credentialVersion(token) !== (row.user.passwordChangedAt?.getTime() ?? 0)
  )
    return null;
  return { email: row.user.email, expiresAt: row.expiresAt };
}

/** Claim, update credentials and invalidate every other link atomically. */
export async function consumePasswordReset(
  database: ResetDatabase,
  token: string,
  hashedPassword: string
): Promise<boolean> {
  const digest = passwordResetDigest(token);
  if (!digest) return false;
  const row = await database.passwordResetToken.findUnique({
    where: { token: digest },
    select: { id: true, userId: true },
  });
  if (!row) return false;
  return database.$transaction(async tx => {
    const [user] = await tx.$queryRaw<
      Array<{ id: string; passwordChangedAt: Date | null }>
    >`SELECT id, "passwordChangedAt" FROM "User" WHERE id = ${row.userId} FOR UPDATE`;
    const version = user?.passwordChangedAt?.getTime() ?? 0;
    if (!user || credentialVersion(token) !== version) return false;
    const claim = await tx.passwordResetToken.updateMany({
      where: {
        id: row.id,
        token: digest,
        userId: row.userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });
    if (claim.count !== 1) return false;
    await tx.user.update({
      where: { id: row.userId },
      data: {
        password: hashedPassword,
        // Preserve monotonic session invalidation even within one millisecond.
        passwordChangedAt: new Date(Math.max(Date.now(), version + 1)),
      },
    });
    await tx.passwordResetToken.deleteMany({
      where: { userId: row.userId, id: { not: row.id } },
    });
    return true;
  });
}

/** A password verified before hashing must not overwrite a concurrent reset. */
export async function changePasswordWithSnapshot(
  database: ResetDatabase,
  snapshot: { id: string; password: string; passwordChangedAt: Date | null },
  hashedPassword: string,
  metadata: Prisma.InputJsonObject
): Promise<boolean> {
  return database.$transaction(async tx => {
    const [current] = await tx.$queryRaw<
      Array<{ id: string; password: string; passwordChangedAt: Date | null }>
    >`SELECT id, password, "passwordChangedAt" FROM "User" WHERE id = ${snapshot.id} FOR UPDATE`;
    const version = current?.passwordChangedAt?.getTime() ?? 0;
    if (
      !current ||
      current.password !== snapshot.password ||
      version !== (snapshot.passwordChangedAt?.getTime() ?? 0)
    )
      return false;
    await tx.user.update({
      where: { id: snapshot.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(Math.max(Date.now(), version + 1)),
      },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: snapshot.id } });
    await tx.auditLog.create({
      data: {
        action: 'password_changed',
        userId: snapshot.id,
        targetId: snapshot.id,
        targetType: 'user',
        metadata,
        success: true,
      },
    });
    return true;
  });
}
