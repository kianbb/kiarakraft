/**
 * Audit Logging System
 * Tracks and logs security-sensitive actions for compliance and monitoring
 */

import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { generateAuditSignature } from '@/lib/audit-integrity';

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',

  // Admin actions
  ADMIN_SELLER_VERIFY = 'ADMIN_SELLER_VERIFY',
  ADMIN_SELLER_REJECT = 'ADMIN_SELLER_REJECT',
  ADMIN_ORDER_UPDATE = 'ADMIN_ORDER_UPDATE',
  ADMIN_PAYMENT_UPDATE = 'ADMIN_PAYMENT_UPDATE',
  ADMIN_PRODUCT_DELETE = 'ADMIN_PRODUCT_DELETE',
  ADMIN_USER_DELETE = 'ADMIN_USER_DELETE',
  ADMIN_USER_UPDATE = 'ADMIN_USER_UPDATE',
  ADMIN_SEED_DATABASE = 'ADMIN_SEED_DATABASE',

  // Seller actions
  SELLER_PRODUCT_CREATE = 'SELLER_PRODUCT_CREATE',
  SELLER_PRODUCT_UPDATE = 'SELLER_PRODUCT_UPDATE',
  SELLER_PRODUCT_DELETE = 'SELLER_PRODUCT_DELETE',
  SELLER_ORDER_UPDATE = 'SELLER_ORDER_UPDATE',

  // Security events
  SECURITY_RATE_LIMIT_EXCEEDED = 'SECURITY_RATE_LIMIT_EXCEEDED',
  SECURITY_CSRF_VIOLATION = 'SECURITY_CSRF_VIOLATION',
  SECURITY_INVALID_FILE_UPLOAD = 'SECURITY_INVALID_FILE_UPLOAD',
  SECURITY_SUSPICIOUS_ACTIVITY = 'SECURITY_SUSPICIOUS_ACTIVITY',

  // Data operations
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_DELETE = 'DATA_DELETE',

  // Payment events
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  targetId?: string; // ID of the affected resource
  targetType?: string; // Type of the affected resource (e.g., 'product', 'order')
  metadata?: Record<string, unknown>; // Additional context
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Filter sensitive data from metadata before storing in audit log
 */
function filterSensitiveData(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const filtered = { ...metadata };
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'key',
    'credential',
    'api_key',
    'apiKey',
    'auth',
    'authorization',
    'cookie',
    'session',
    'credit_card',
    'creditCard',
    'ssn',
    'social_security',
    'passport',
    'license',
  ];

  // Recursively filter sensitive keys
  function filterObject(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => filterObject(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains sensitive words
      const isSensitive = sensitiveKeys.some(sensitive =>
        lowerKey.includes(sensitive.toLowerCase())
      );

      if (isSensitive) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = filterObject(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return filterObject(filtered) as Record<string, unknown>;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Filter sensitive data from metadata
    const filteredMetadata = filterSensitiveData(entry.metadata);
    const timestamp = new Date();

    // Generate HMAC signature for integrity protection
    const signature = generateAuditSignature({
      action: entry.action,
      userId: entry.userId || null,
      targetId: entry.targetId || null,
      targetType: entry.targetType || null,
      ipAddress: entry.ipAddress || null,
      success: entry.success,
      timestamp,
    });

    // Store in database
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId || null,
        userEmail: entry.userEmail || null,
        userRole: entry.userRole || null,
        targetId: entry.targetId || null,
        targetType: entry.targetType || null,
        metadata: filteredMetadata
          ? JSON.parse(JSON.stringify(filteredMetadata))
          : null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        success: entry.success,
        errorMessage: entry.errorMessage || null,
        timestamp,
        signature: signature || null,
      },
    });

    // Log critical security events to Sentry
    if (
      entry.action.startsWith('SECURITY_') ||
      entry.action === AuditAction.ADMIN_USER_DELETE ||
      entry.action === AuditAction.ADMIN_SEED_DATABASE ||
      (!entry.success && entry.action.startsWith('ADMIN_'))
    ) {
      Sentry.captureMessage(`Audit Log: ${entry.action}`, {
        level: entry.success ? 'info' : 'warning',
        extra: { ...entry } as Record<string, unknown>,
      });
    }

    // Only log to console in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${entry.action}`, {
        user: entry.userEmail || entry.userId,
        target: entry.targetId,
        success: entry.success,
      });
    }
  } catch (error) {
    // Don't let audit logging failures break the application
    console.error('Failed to create audit log:', error);
    Sentry.captureException(error);
  }
}

/**
 * Helper to extract request metadata for audit logging
 */
export function extractRequestMetadata(request: Request): {
  ipAddress: string;
  userAgent: string;
} {
  const ipAddress =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  const userAgent = request.headers.get('user-agent') || 'unknown';

  return { ipAddress, userAgent };
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  action?: AuditAction;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.targetId && { targetId: filters.targetId }),
      ...(filters.startDate && {
        timestamp: {
          gte: filters.startDate,
          ...(filters.endDate && { lte: filters.endDate }),
        },
      }),
    },
    orderBy: { timestamp: 'desc' },
    take: filters.limit || 100,
  });
}

/**
 * Clean up old audit logs (for GDPR compliance)
 * Keep logs for 90 days by default
 */
export async function cleanupOldAuditLogs(
  retentionDays: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.auditLog.deleteMany({
    where: {
      timestamp: {
        lt: cutoffDate,
      },
    },
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(`Cleaned up ${result.count} old audit log entries`);
  }
  return result.count;
}

/**
 * Get suspicious activity summary
 */
export async function getSuspiciousActivitySummary(hours: number = 24) {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  const suspiciousEvents = await prisma.auditLog.findMany({
    where: {
      timestamp: { gte: since },
      OR: [
        { action: { startsWith: 'SECURITY_' } },
        { success: false, action: { startsWith: 'LOGIN_' } },
        { success: false, action: { startsWith: 'ADMIN_' } },
      ],
    },
    orderBy: { timestamp: 'desc' },
  });

  // Group by IP address to identify potential attackers
  const byIp = new Map<string, number>();
  suspiciousEvents.forEach(event => {
    const ip = event.ipAddress || 'unknown';
    byIp.set(ip, (byIp.get(ip) || 0) + 1);
  });

  return {
    totalEvents: suspiciousEvents.length,
    uniqueIps: byIp.size,
    topOffenders: Array.from(byIp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count })),
    recentEvents: suspiciousEvents.slice(0, 20),
  };
}

/**
 * Middleware helper for automatic audit logging of admin actions
 */
export function withAuditLog<T extends unknown[]>(
  action: AuditAction,
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    const [request] = args as unknown as [Request, ...unknown[]];
    const metadata = extractRequestMetadata(request);
    let success = false;
    let errorMessage: string | undefined;

    try {
      const response = await handler(...args);
      success = response.status < 400;

      if (!success) {
        const body = await response.text();
        try {
          const json = JSON.parse(body);
          errorMessage = json.error || `HTTP ${response.status}`;
        } catch {
          errorMessage = `HTTP ${response.status}`;
        }
      }

      // Log the action
      await createAuditLog({
        action,
        ...metadata,
        success,
        errorMessage,
      });

      return response;
    } catch (error) {
      // Log the failed action
      await createAuditLog({
        action,
        ...metadata,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  };
}
