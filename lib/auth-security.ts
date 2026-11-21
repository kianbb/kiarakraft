/**
 * Authentication Security Module
 * Handles rate limiting, account lockout, and brute force protection
 */

import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { withinBcryptLimit } from './password-reset';

// Configuration constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_IP_ATTEMPTS = 10; // Max attempts per IP per minute

/**
 * Validate password complexity
 */
export function validatePasswordComplexity(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!withinBcryptLimit(password)) {
    errors.push('Password must not exceed 72 UTF-8 bytes');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for common patterns
  const commonPatterns = [
    /(.)\1{3,}/, // 4+ repeated characters
    /123456|654321|qwerty|password|admin/i, // Common sequences
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('Password contains common patterns that are not secure');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function remainingSeconds(resetTime: Date): number {
  return Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

/**
 * Check if an account is locked due to too many failed attempts
 */
export async function isAccountLocked(email: string): Promise<boolean> {
  return (await getLockoutTimeRemaining(email)) > 0;
}

/**
 * Get remaining lockout time in seconds
 */
export async function getLockoutTimeRemaining(email: string): Promise<number> {
  try {
    const lockout = await prisma.rateLimit.findUnique({
      where: { identifier: `account_lock:${email}` },
    });
    return lockout ? remainingSeconds(lockout.resetTime) : 0;
  } catch (error) {
    console.error('Database error getting lockout time:', error);
    return 0;
  }
}

async function blockedFor(
  identifier: string,
  maximum: number
): Promise<number> {
  const counter = await prisma.rateLimit.findUnique({ where: { identifier } });
  return counter && counter.count >= maximum
    ? remainingSeconds(counter.resetTime)
    : 0;
}

/**
 * Check rate limiting for login attempts
 */
export async function checkLoginRateLimit(
  email: string,
  ip: string
): Promise<{
  allowed: boolean;
  reason?: 'account_locked' | 'too_many_attempts' | 'ip_blocked';
  retryAfter?: number;
}> {
  try {
    const lockout = await getLockoutTimeRemaining(email);
    if (lockout > 0) {
      return { allowed: false, reason: 'account_locked', retryAfter: lockout };
    }

    const ipWait = await blockedFor(`ip_attempts:${ip}`, MAX_IP_ATTEMPTS);
    if (ipWait > 0) {
      return { allowed: false, reason: 'ip_blocked', retryAfter: ipWait };
    }

    const emailWait = await blockedFor(
      `login_attempts:${email}`,
      MAX_LOGIN_ATTEMPTS
    );
    if (emailWait > 0) {
      return {
        allowed: false,
        reason: 'too_many_attempts',
        retryAfter: emailWait,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Database error checking login rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

// The conflicting row is locked and evaluated by PostgreSQL. Concurrent
// requests in a renewed window each count once and keep its deadline fixed.
// Prisma reads these timestamp-without-time-zone columns as UTC.
async function incrementAttempt(
  tx: Prisma.TransactionClient,
  identifier: string,
  now: Date,
  windowEnd: Date,
  maximum: number
): Promise<number> {
  const [counter] = await tx.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (id, identifier, count, "resetTime", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text, ${identifier}, 1,
      ${windowEnd}::timestamptz AT TIME ZONE 'UTC',
      ${now}::timestamptz AT TIME ZONE 'UTC',
      ${now}::timestamptz AT TIME ZONE 'UTC'
    )
    ON CONFLICT (identifier) DO UPDATE SET
      count = CASE
        WHEN "RateLimit"."resetTime" <= EXCLUDED."updatedAt" THEN 1
        WHEN "RateLimit".count < ${maximum} THEN "RateLimit".count + 1
        ELSE "RateLimit".count
      END,
      "resetTime" = CASE
        WHEN "RateLimit"."resetTime" <= EXCLUDED."updatedAt" THEN EXCLUDED."resetTime"
        ELSE "RateLimit"."resetTime"
      END,
      "updatedAt" = GREATEST("RateLimit"."updatedAt", EXCLUDED."updatedAt")
    RETURNING count
  `;
  return counter.count;
}

/**
 * Record an evaluated login attempt
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  try {
    const now = new Date();
    const rateLimitWindow = new Date(now.getTime() + RATE_LIMIT_WINDOW);
    const accountLock = `account_lock:${email}`;
    const emailCounter = `login_attempts:${email}`;

    await prisma.$transaction(async tx => {
      await incrementAttempt(
        tx,
        `ip_attempts:${ip}`,
        now,
        rateLimitWindow,
        MAX_IP_ATTEMPTS
      );

      if (success) {
        // Keep the email-then-lock row order used by failed attempts. A login
        // that was already in progress must leave a concurrently added lock active.
        await tx.rateLimit.deleteMany({ where: { identifier: emailCounter } });
        await tx.rateLimit.deleteMany({
          where: { identifier: accountLock, resetTime: { lte: now } },
        });
        return;
      }

      const failedAttempts = await incrementAttempt(
        tx,
        emailCounter,
        now,
        rateLimitWindow,
        MAX_LOGIN_ATTEMPTS
      );
      if (failedAttempts < MAX_LOGIN_ATTEMPTS) return;

      const lockoutWindow = new Date(now.getTime() + LOCKOUT_DURATION);
      await tx.$executeRaw`
        INSERT INTO "RateLimit" (id, identifier, count, "resetTime", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text, ${accountLock}, ${failedAttempts},
          ${lockoutWindow}::timestamptz AT TIME ZONE 'UTC',
          ${now}::timestamptz AT TIME ZONE 'UTC',
          ${now}::timestamptz AT TIME ZONE 'UTC'
        )
        ON CONFLICT (identifier) DO UPDATE SET
          count = EXCLUDED.count,
          "resetTime" = EXCLUDED."resetTime",
          "updatedAt" = EXCLUDED."updatedAt"
        WHERE "RateLimit"."resetTime" <= EXCLUDED."updatedAt"
      `;
    });
  } catch (error) {
    console.error('Database error recording login attempt:', error);
  }
}

/**
 * Get the client IP address from request headers
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  // Check various headers that might contain the real IP
  const possibleHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip', // Cloudflare
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded',
  ];

  for (const header of possibleHeaders) {
    const value = headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip && ip !== 'unknown') {
        return ip;
      }
    }
  }

  return 'unknown';
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
}

/**
 * Clean up old data periodically (call this periodically to prevent memory leaks)
 */
export async function cleanupOldData(): Promise<void> {
  try {
    const now = new Date();

    // Clean up all expired rate limit entries
    await prisma.rateLimit.deleteMany({
      where: {
        resetTime: {
          lt: now,
        },
      },
    });
  } catch (error) {
    console.error('Database error cleaning up old auth data:', error);
  }
}

// Set up periodic cleanup (every 30 minutes)
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(
    () => {
      cleanupOldData().catch(error => {
        console.error('Failed to cleanup old auth data:', error);
      });
    },
    30 * 60 * 1000
  );
  cleanupTimer.unref?.();
}
