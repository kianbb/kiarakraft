/**
 * Atomic Rate Limiting with Database
 * Prevents race conditions using database transactions and row-level locking
 */

import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (request: NextRequest) => string;
}

/**
 * Create an atomic rate limiter using database transactions
 */
export function createAtomicRateLimiter(config: RateLimitConfig) {
  return async function rateLimit(request: NextRequest): Promise<{
    allowed: boolean;
    remainingRequests: number;
    resetTime: number;
  }> {
    // Generate unique identifier for this request
    const keyGenerator =
      config.keyGenerator ||
      (req => {
        const ip =
          req.headers.get('x-forwarded-for') ||
          req.headers.get('x-real-ip') ||
          req.headers.get('cf-connecting-ip') ||
          'unknown';
        const endpoint = new URL(req.url).pathname;
        return `${ip}:${endpoint}`;
      });

    const identifier = keyGenerator(request);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + config.windowMs);

    try {
      // Use a transaction with row-level locking to prevent race conditions
      const result = await prisma.$transaction(
        async tx => {
          // Try to find and lock the rate limit entry
          // Using parameterized query with Prisma.sql for safe row-level lock
          const existing = await tx.$queryRaw<
            Array<{
              id: string;
              identifier: string;
              count: number;
              resetTime: Date;
            }>
          >(
            Prisma.sql`
              SELECT * FROM "RateLimit"
              WHERE identifier = ${identifier}
              FOR UPDATE
            `
          );

          const existingEntry = existing[0];

          // If no entry exists, create one
          if (!existingEntry) {
            await tx.rateLimit.create({
              data: {
                identifier,
                count: 1,
                resetTime: windowEnd,
              },
            });

            return {
              allowed: true,
              remainingRequests: config.maxRequests - 1,
              resetTime: windowEnd.getTime(),
              count: 1,
            };
          }

          // If the window has expired, reset the counter
          if (existingEntry.resetTime < now) {
            await tx.rateLimit.update({
              where: { id: existingEntry.id },
              data: {
                count: 1,
                resetTime: windowEnd,
              },
            });

            return {
              allowed: true,
              remainingRequests: config.maxRequests - 1,
              resetTime: windowEnd.getTime(),
              count: 1,
            };
          }

          // Check if limit is exceeded
          if (existingEntry.count >= config.maxRequests) {
            return {
              allowed: false,
              remainingRequests: 0,
              resetTime: existingEntry.resetTime.getTime(),
              count: existingEntry.count,
            };
          }

          // Increment the counter atomically
          const updated = await tx.rateLimit.update({
            where: { id: existingEntry.id },
            data: {
              count: {
                increment: 1,
              },
            },
          });

          return {
            allowed: true,
            remainingRequests: config.maxRequests - updated.count,
            resetTime: existingEntry.resetTime.getTime(),
            count: updated.count,
          };
        },
        {
          isolationLevel: 'Serializable', // Highest isolation level to prevent race conditions
          timeout: 5000, // 5 second timeout
        }
      );

      return {
        allowed: result.allowed,
        remainingRequests: result.remainingRequests,
        resetTime: result.resetTime,
      };
    } catch (error) {
      console.error('Atomic rate limiting error:', error);

      // On database error, fail open (allow request) to prevent service disruption
      // But log the incident for monitoring
      return {
        allowed: true,
        remainingRequests: config.maxRequests - 1,
        resetTime: windowEnd.getTime(),
      };
    }
  };
}

/**
 * Cleanup expired rate limit entries (should be run periodically)
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  try {
    const result = await prisma.rateLimit.deleteMany({
      where: {
        resetTime: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  } catch (error) {
    console.error('Failed to cleanup expired rate limits:', error);
    return 0;
  }
}

// Pre-configured atomic rate limiters
export const atomicAuthRateLimit = createAtomicRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
});

export const atomicPaymentRateLimit = createAtomicRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
});

export const atomicOrderRateLimit = createAtomicRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3,
});

export const atomicUploadRateLimit = createAtomicRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
});

/**
 * Middleware helper for atomic rate limiting
 */
export function withAtomicRateLimit<T extends unknown[]>(
  rateLimiter: ReturnType<typeof createAtomicRateLimiter>,
  handler: (request: NextRequest, ...rest: T) => Promise<Response>
) {
  return async (request: NextRequest, ...rest: T): Promise<Response> => {
    const { allowed, remainingRequests, resetTime } =
      await rateLimiter(request);

    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      console.warn(
        `Rate limit exceeded for ${request.url} from IP ${
          request.headers.get('x-forwarded-for') || 'unknown'
        }`
      );

      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(request, ...rest);

    // Add rate limit headers to successful responses
    response.headers.set('X-RateLimit-Remaining', remainingRequests.toString());
    response.headers.set(
      'X-RateLimit-Reset',
      Math.ceil(resetTime / 1000).toString()
    );

    return response;
  };
}

// Schedule periodic cleanup (if running in a long-lived process)
if (
  typeof setInterval !== 'undefined' &&
  process.env.NODE_ENV === 'production'
) {
  // Cleanup every 5 minutes
  setInterval(
    async () => {
      const cleaned = await cleanupExpiredRateLimits();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired rate limit entries`);
      }
    },
    5 * 60 * 1000
  );
}
