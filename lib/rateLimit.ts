import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import { auth } from '@/lib/auth';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  useUserRateLimit?: boolean; // Use user-based rate limiting for authenticated users
  userMaxRequests?: number; // Different limit for authenticated users (optional)
}

// Cleanup old entries periodically
setInterval(
  async () => {
    const now = new Date();
    try {
      await prisma.rateLimit.deleteMany({
        where: {
          resetTime: {
            lt: now,
          },
        },
      });
    } catch (error) {
      console.error('Failed to cleanup old rate limit entries:', error);
    }
  },
  5 * 60 * 1000
); // Cleanup every 5 minutes

export function createRateLimiter(config: RateLimitConfig) {
  return async function rateLimit(request: NextRequest): Promise<{
    allowed: boolean;
    remainingRequests: number;
    resetTime: number;
  }> {
    // Get IP address
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      'unknown';

    // Get user session if configured for user-based rate limiting
    let userId: string | null = null;
    if (config.useUserRateLimit) {
      try {
        const session = await auth();
        userId = session?.user?.id || null;
      } catch (error) {
        console.error('Failed to get user session for rate limiting:', error);
      }
    }

    // Create a unique identifier
    const endpoint = new URL(request.url).pathname;
    const identifier = userId
      ? `user:${userId}:${endpoint}` // User-based identifier
      : `ip:${ip}:${endpoint}`; // IP-based identifier

    // Use different limits for authenticated vs anonymous users
    const maxRequests =
      userId && config.userMaxRequests
        ? config.userMaxRequests
        : config.maxRequests;

    // Debug logging
    console.log('[RateLimit Debug]', {
      endpoint,
      identifier,
      userId,
      ip,
      maxRequests,
      windowMs: config.windowMs,
      useUserRateLimit: config.useUserRateLimit,
    });

    const now = new Date();
    const windowEnd = new Date(now.getTime() + config.windowMs);

    try {
      // Use database transaction for atomic operations
      const result = await prisma.$transaction(async tx => {
        // First, clean up expired entries for this identifier
        await tx.rateLimit.deleteMany({
          where: {
            identifier,
            resetTime: {
              lt: now,
            },
          },
        });

        // Get or create rate limit entry
        const existingEntry = await tx.rateLimit.findUnique({
          where: { identifier },
        });

        if (!existingEntry) {
          // First request - create new entry
          await tx.rateLimit.create({
            data: {
              identifier,
              count: 1,
              resetTime: windowEnd,
            },
          });

          return {
            allowed: true,
            remainingRequests: maxRequests - 1,
            resetTime: windowEnd.getTime(),
          };
        }

        if (existingEntry.count >= maxRequests) {
          console.log('[RateLimit BLOCKED]', {
            identifier,
            count: existingEntry.count,
            maxRequests,
            resetTime: existingEntry.resetTime,
          });
          return {
            allowed: false,
            remainingRequests: 0,
            resetTime: existingEntry.resetTime.getTime(),
          };
        }

        // Increment count
        const updatedEntry = await tx.rateLimit.update({
          where: { identifier },
          data: {
            count: {
              increment: 1,
            },
          },
        });

        return {
          allowed: true,
          remainingRequests: maxRequests - updatedEntry.count,
          resetTime: existingEntry.resetTime.getTime(),
        };
      });

      return result;
    } catch (error) {
      console.error('[RateLimit DB ERROR]', {
        identifier,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // SECURITY: Fail closed - deny requests if database fails to prevent bypass attacks
      // This prevents attackers from DoS'ing the database to disable rate limiting
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: windowEnd.getTime(),
      };
    }
  };
}

// Pre-configured rate limiters for different endpoint types
export const paymentRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 payment attempts per 15 minutes
});

export const adminRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 admin actions per minute
});

export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 auth attempts per 15 minutes per IP
  useUserRateLimit: false, // Auth endpoints use IP-based only (no user session yet)
});

export const orderRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3, // 3 orders per 5 minutes
});

export const uploadRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 uploads per minute for IP
  useUserRateLimit: true, // Use user-based rate limiting for authenticated users
  userMaxRequests: 20, // Authenticated users can upload more
});

export const sellerProductRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // Increased: 30 product operations per minute for IP
  useUserRateLimit: true, // Use user-based rate limiting for authenticated sellers
  userMaxRequests: 60, // Increased: 60 for authenticated sellers (1 per second)
});

/**
 * Middleware helper to add rate limiting to API routes
 */
export function withRateLimit<T extends unknown[]>(
  rateLimiter: ReturnType<typeof createRateLimiter>,
  handler: (request: NextRequest, ...rest: T) => Promise<Response>
) {
  return async (request: NextRequest, ...rest: T): Promise<Response> => {
    const { allowed, remainingRequests, resetTime } =
      await rateLimiter(request);

    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      console.warn(
        `Rate limit exceeded for ${request.url} from IP ${request.headers.get('x-forwarded-for') || 'unknown'}`
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

export const sellerRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // Increased: 60 seller actions per minute
  useUserRateLimit: true, // Use user-based rate limiting
  userMaxRequests: 120, // Increased: 120 for authenticated sellers
});

export const cartRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 cart operations per minute
});
