/**
 * Authentication Security Module
 * Handles rate limiting, account lockout, and brute force protection
 */

import { prisma } from './prisma';

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

/**
 * Check if an account is locked due to too many failed attempts
 */
export async function isAccountLocked(email: string): Promise<boolean> {
  try {
    const lockout = await prisma.rateLimit.findUnique({
      where: { identifier: `account_lock:${email}` },
    });

    if (!lockout) {
      return false;
    }

    // Check if lockout period has expired
    if (new Date() > lockout.resetTime) {
      await prisma.rateLimit.delete({
        where: { identifier: `account_lock:${email}` },
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Database error checking account lock:', error);
    return false; // Fail open
  }
}

/**
 * Get remaining lockout time in seconds
 */
export async function getLockoutTimeRemaining(email: string): Promise<number> {
  try {
    const lockout = await prisma.rateLimit.findUnique({
      where: { identifier: `account_lock:${email}` },
    });

    if (!lockout || new Date() > lockout.resetTime) {
      return 0;
    }

    return Math.ceil((lockout.resetTime.getTime() - Date.now()) / 1000);
  } catch (error) {
    console.error('Database error getting lockout time:', error);
    return 0;
  }
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
    // Check if account is locked
    if (await isAccountLocked(email)) {
      return {
        allowed: false,
        reason: 'account_locked',
        retryAfter: await getLockoutTimeRemaining(email),
      };
    }

    // Check IP-based rate limiting
    const ipAttemptCount = await prisma.rateLimit.findUnique({
      where: { identifier: `ip_attempts:${ip}` },
    });

    if (ipAttemptCount && ipAttemptCount.count >= MAX_IP_ATTEMPTS) {
      return {
        allowed: false,
        reason: 'ip_blocked',
        retryAfter: 60, // IP blocks last 1 minute
      };
    }

    // Check email-based rate limiting
    const emailAttemptCount = await prisma.rateLimit.findUnique({
      where: { identifier: `login_attempts:${email}` },
    });

    if (emailAttemptCount && emailAttemptCount.count >= MAX_LOGIN_ATTEMPTS) {
      return {
        allowed: false,
        reason: 'too_many_attempts',
        retryAfter: 60,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Database error checking login rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Record a login attempt
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  try {
    const now = new Date();
    const rateLimitWindow = new Date(now.getTime() + RATE_LIMIT_WINDOW);
    const lockoutWindow = new Date(now.getTime() + LOCKOUT_DURATION);

    await prisma.$transaction(async tx => {
      // Record IP attempt
      await tx.rateLimit.upsert({
        where: { identifier: `ip_attempts:${ip}` },
        update: {
          count: { increment: 1 },
          resetTime: rateLimitWindow,
        },
        create: {
          identifier: `ip_attempts:${ip}`,
          count: 1,
          resetTime: rateLimitWindow,
        },
      });

      if (!success) {
        // Record failed email attempt
        const emailAttempt = await tx.rateLimit.upsert({
          where: { identifier: `login_attempts:${email}` },
          update: {
            count: { increment: 1 },
            resetTime: rateLimitWindow,
          },
          create: {
            identifier: `login_attempts:${email}`,
            count: 1,
            resetTime: rateLimitWindow,
          },
        });

        // Check if we should lock the account
        if (emailAttempt.count >= MAX_LOGIN_ATTEMPTS) {
          await tx.rateLimit.upsert({
            where: { identifier: `account_lock:${email}` },
            update: {
              count: emailAttempt.count,
              resetTime: lockoutWindow,
            },
            create: {
              identifier: `account_lock:${email}`,
              count: emailAttempt.count,
              resetTime: lockoutWindow,
            },
          });

          console.warn(
            `Account locked due to too many failed attempts: ${email} (IP: ${ip})`
          );
        }
      } else {
        // Successful login - clear any lockout and failed attempts
        await tx.rateLimit.deleteMany({
          where: {
            identifier: {
              in: [`account_lock:${email}`, `login_attempts:${email}`],
            },
          },
        });
      }
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
  setInterval(
    () => {
      cleanupOldData().catch(error => {
        console.error('Failed to cleanup old auth data:', error);
      });
    },
    30 * 60 * 1000
  );
}
